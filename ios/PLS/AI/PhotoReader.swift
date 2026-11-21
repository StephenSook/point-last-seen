import CoreGraphics
import Foundation
import FoundationModels
import PLSCore

/// What one photo read gives back: what Apple's model saw, or nothing.
enum PhotoReadResult: Sendable {
    case described(PhotoDescription, model: String, latencyMs: Double)
    case failed
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
/// written anywhere and is never sent: there is no cloud route for photos.
enum PhotoReader {
    static let instructions = """
    You look at one photo a searcher took of something found during a search training drill. \
    Say what the main object is, its main color and its kind, and whether any person is visible.
    """
    static let prompt = "Read this photo."
    /// A model call can stall like any other, so a photo read has a limit.
    static let timeoutSeconds: Double = 30

    /// True when Apple's model on this phone can read a photo: iOS 27, available, with the vision capability.
    static var available: Bool {
        guard #available(iOS 27, *) else { return false }
        let model = SystemLanguageModel.default
        return model.isAvailable && model.capabilities.contains(.vision)
    }

    static func read(_ image: CGImage) async -> PhotoReadResult {
        guard #available(iOS 27, *), available else { return .failed }
        let name = ModelSessionFactory.onDeviceStatus().variant
        let start = Date()
        let answer = await Timeout.run(seconds: timeoutSeconds) { () -> PhotoReadG? in
            let session = LanguageModelSession(model: SystemLanguageModel.default, instructions: instructions)
            return try? await session.respond(generating: PhotoReadG.self, options: FoundationModelRunner.onDeviceOptions) {
                prompt
                Attachment(image)
            }.content
        }
        guard let read = answer ?? nil else { return .failed }
        let described = PhotoDescription(showsPerson: read.showsPerson, object: read.object, color: read.color.core, kind: read.kind.core)
        return .described(described, model: name, latencyMs: Date().timeIntervalSince(start) * 1000)
    }
}
