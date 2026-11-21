import CoreGraphics
import Foundation
import FoundationModels
import PLSCore

/// What one photo read gives back: what Apple's model saw, or nothing.
enum PhotoReadResult: Sendable {
    case described(PhotoDescription, model: String, latencyMs: Double)
    case failed
    /// An earlier photo's read is still running, so no new one starts (at most one image is held).
    case busy
}

/// The answer to "is any part of a person visible?"; nil when there was no clean answer.
enum PersonAnswer: Sendable { case yes, no }

@Generable enum YesNoG { case yes, no }

/// The separate person question: a second look at the same image, asked on its own.
@Generable struct PersonCheckG {
    @Guide(description: "yes if any part of a person is visible (a face, body, hand, arm, leg or foot), otherwise no")
    var answer: YesNoG
}

/// Lets one photo read run at a time. It opens only when the model work has really ended, also after a timeout.
final class PhotoReadGate: @unchecked Sendable {
    private let lock = NSLock()
    private var running = false

    func tryStart() -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard !running else { return false }
        running = true
        return true
    }

    func end() {
        lock.lock(); defer { lock.unlock() }
        running = false
    }
}

/// Opens one read's gate once, whichever of its work or its time limit ends first.
final class EndOnce: @unchecked Sendable {
    private let lock = NSLock()
    private var gate: PhotoReadGate?

    init(_ gate: PhotoReadGate) { self.gate = gate }

    func end() {
        lock.lock()
        let g = gate
        gate = nil
        lock.unlock()
        g?.end()
    }
}

/// Our one reference to the photo while it is read; released when the read ends or gives up. (A model call still
/// running after a timeout holds its own copy, which this code cannot release; it ends within the output cap.)
final class ImageHolder: @unchecked Sendable {
    private let lock = NSLock()
    private var stored: CGImage?

    init(_ image: CGImage) { stored = image }

    var image: CGImage? {
        lock.lock(); defer { lock.unlock() }
        return stored
    }

    func release() {
        lock.lock(); defer { lock.unlock() }
        stored = nil
    }
}

@Generable enum PhotoKindG: CaseIterable { case hat, coat, shirt, pants, shoe, glove, bag, glasses, cane, walker, phone, keys, wallet, other }

extension PhotoKindG {
    var core: PhotoObjectKind {
        switch self {
        case .hat: .hat; case .coat: .coat; case .shirt: .shirt; case .pants: .pants; case .shoe: .shoe; case .glove: .glove
        case .bag: .bag; case .glasses: .glasses; case .cane: .cane; case .walker: .walker; case .phone: .phone
        case .keys: .keys; case .wallet: .wallet; case .other: .other
        }
    }
}

/// What Apple's model is asked about one photo. It is never shown the family's description: shown it, the model
/// matched a black cap and a green knit hat to "red baseball cap". Code compares (`PhotoClue`).
@Generable struct PhotoReadG {
    @Guide(description: "true if any part of a person (face, body, hand, arm or leg) is visible in the photo")
    var showsPerson: Bool
    @Guide(description: "The one main object in the photo, two to four words, for example 'red baseball cap'")
    var object: String
    var color: ColorG
    var kind: PhotoKindG
}

/// Reads a photo of something found with Apple's on-device model, on the phone. The photo stays in memory, is never
/// written anywhere and is never sent: there is no cloud route for photos. It fails closed: the photo is kept only
/// when a separate person question answers a clean no and the description comes back without a person in it.
enum PhotoReader {
    static let instructions = """
    You look at one photo a searcher took of something found during a search training drill. \
    Say what the main object is, its main color and its kind, and whether any person is visible.
    """
    static let prompt = "Read this photo."
    static let personInstructions = """
    You look at one photo a searcher took during a search training drill. \
    Is any part of a person visible in this photo? Answer only yes or no.
    """
    static let personPrompt = "Is any part of a person visible? Answer only yes or no."
    /// A model call can stall like any other, so a photo read (both questions) has a limit.
    static let timeoutSeconds: Double = 30
    static let gate = PhotoReadGate()

    /// True when Apple's model on this phone can read a photo: iOS 27, available, with the vision capability.
    static var available: Bool { ModelSessionFactory.photoReadingSupported }

    /// The photo is kept only with a description and a clean no; a yes on either question marks a person.
    static func combine(_ description: PhotoDescription?, person: PersonAnswer?, model: String, latencyMs: Double) -> PhotoReadResult {
        if person == .yes || description?.showsPerson == true {
            let seen = PhotoDescription(showsPerson: true, object: description?.object ?? "", color: description?.color ?? .unknown,
                                        kind: description?.kind ?? .other)
            return .described(seen, model: model, latencyMs: latencyMs)
        }
        guard person == .no, let description else { return .failed }
        return .described(description, model: model, latencyMs: latencyMs)
    }

    static func read(_ image: CGImage, stillCurrent: @escaping @Sendable () -> Bool) async -> PhotoReadResult {
        guard #available(iOS 27, *), available else { return .failed }
        return await run(image, timeoutSeconds: timeoutSeconds, gate: gate, model: ModelSessionFactory.onDeviceStatus().variant,
                         askPerson: { await askPerson($0) }, describe: { await describe($0) }, stillCurrent: stillCurrent)
    }

    /// One read: the person question first, the description only after a clean no, both within `timeoutSeconds`.
    /// The gate opens exactly once for this read, when its work ends or at the limit, whichever is first, so a stalled
    /// model call never blocks the next photo and a late worker never opens a later read's gate. Before each model
    /// call the worker checks that the read is still wanted (not cancelled, image not released, its mission still on
    /// screen), so an answer that
    /// comes after the limit starts nothing more. A model call already running keeps its own copy of the image until
    /// it returns; this code cannot release that copy.
    static func run(_ image: CGImage, timeoutSeconds: Double, gate: PhotoReadGate, model: String,
                    askPerson: @escaping @Sendable (CGImage) async -> PersonAnswer?,
                    describe: @escaping @Sendable (CGImage) async -> PhotoDescription?,
                    stillCurrent: @escaping @Sendable () -> Bool = { true }) async -> PhotoReadResult {
        guard gate.tryStart() else { return .busy }
        let holder = ImageHolder(image)
        let endOnce = EndOnce(gate)
        let start = Date()
        let answer = await Timeout.run(seconds: timeoutSeconds) { () -> (PhotoDescription?, PersonAnswer?) in
            defer { endOnce.end() }
            guard !Task.isCancelled, stillCurrent(), let first = holder.image else { return (nil, nil) }
            let person = await askPerson(first)
            guard person == .no, !Task.isCancelled, stillCurrent(), let second = holder.image else { return (nil, person) }
            return (await describe(second), person)
        }
        holder.release()
        endOnce.end()
        guard let (description, person) = answer else { return .failed }
        return combine(description, person: person, model: model, latencyMs: Date().timeIntervalSince(start) * 1000)
    }

    @available(iOS 27, *)
    static func askPerson(_ image: CGImage) async -> PersonAnswer? {
        let session = ModelSessionFactory.photoSession(instructions: personInstructions)
        guard let check = try? await session.respond(generating: PersonCheckG.self, options: FoundationModelRunner.onDeviceOptions, prompt: {
            personPrompt
            Attachment(image)
        }).content else { return nil }
        return check.answer == .no ? .no : .yes
    }

    @available(iOS 27, *)
    static func describe(_ image: CGImage) async -> PhotoDescription? {
        let session = ModelSessionFactory.photoSession(instructions: instructions)
        guard let read = try? await session.respond(generating: PhotoReadG.self, options: FoundationModelRunner.onDeviceOptions, prompt: {
            prompt
            Attachment(image)
        }).content else { return nil }
        return PhotoDescription(showsPerson: read.showsPerson, object: read.object, color: read.color.core, kind: read.kind.core)
    }
}
