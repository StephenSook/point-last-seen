import AVFoundation
import FirebaseAILogic
import FirebasePerformance
import Foundation
import PLSCore

/// A voice that speaks one line and returns the milliseconds until the sound started, or nil if
/// it could not speak. It asks `stillWanted` right before any sound starts (after a cloud voice's
/// fetch), and plays nothing when the line is no longer wanted. `stop` silences it.
@MainActor
protocol AssignmentVoice: AnyObject {
    func speak(_ text: String, ifStillWanted stillWanted: @MainActor () -> Bool) async -> Double?
    func stop()
}

/// One spoken line, for the `assignment_speech` trace: which voice, whether it spoke, how fast.
struct SpeechRecord: Equatable, Sendable {
    var path: SpokenAssignment.Path
    var outcome: String              // "spoken" or "failed"
    var startMs: Double?
}

/// Speaks a new assignment while the app is open (P-06 push brings it to a locked screen later).
/// The words are command's approved plan only (`SpokenAssignment`). The cloud voice is used only
/// when `voice_template_id` names a template and the phone is online and signed in; any failure falls back to the
/// phone's own voice. Every attempt is recorded, so the two voices can be compared on real numbers.
@MainActor
final class AssignmentSpeaker {
    private let onDevice: AssignmentVoice
    private let makeCloud: (String) -> AssignmentVoice
    private let record: (SpeechRecord) -> Void
    private var lastSpoken: Assignment?
    private var cloud: AssignmentVoice?

    init(onDevice: AssignmentVoice = OnDeviceVoice(),
         makeCloud: @escaping (String) -> AssignmentVoice = { CloudVoice(templateId: $0) },
         record: @escaping (SpeechRecord) -> Void = AssignmentSpeaker.trace) {
        self.onDevice = onDevice
        self.makeCloud = makeCloud
        self.record = record
    }

    /// Speaks a new assignment. `isCurrent` says whether it is still the loaded mission's; it is
    /// asked before any sound starts and before the phone's own voice stands in for a failed cloud
    /// voice, so a line dropped meanwhile is never played.
    func update(_ assignment: Assignment?, voiceTemplate: String, online: Bool, killCloud: Bool, signedIn: Bool,
                isCurrent: @escaping @MainActor () -> Bool = { true }) async {
        guard SpokenAssignment.shouldSpeak(previous: lastSpoken, current: assignment), let assignment else { return }
        lastSpoken = assignment
        let text = SpokenAssignment.text(assignment)
        if SpokenAssignment.path(cloudModel: voiceTemplate, online: online, killCloud: killCloud, signedIn: signedIn) == .cloud {
            // The cloud voice is a model: it never gets a phone number. The phone's own voice reads the task as written.
            let voice = makeCloud(voiceTemplate.trimmingCharacters(in: .whitespaces))
            cloud = voice
            let start = await voice.speak(PhoneNumbers.scrub(text), ifStillWanted: isCurrent)
            guard isCurrent() else { return }
            record(SpeechRecord(path: .cloud, outcome: start == nil ? "failed" : "spoken", startMs: start))
            if start != nil { return }
        }
        guard isCurrent() else { return }
        let start = await onDevice.speak(text, ifStillWanted: isCurrent)
        guard isCurrent() else { return }
        record(SpeechRecord(path: .onDevice, outcome: start == nil ? "failed" : "spoken", startMs: start))
    }

    /// Silences both voices and forgets the last line, for a dropped mission or a new membership:
    /// nothing of the old one plays, and the next membership's assignment is spoken even when it
    /// matches a line spoken before.
    func stop() {
        onDevice.stop()
        cloud?.stop()
        cloud = nil
        lastSpoken = nil
    }

    /// One Performance trace per attempt: the voice path, the outcome and the time to first sound.
    nonisolated static func trace(_ r: SpeechRecord) {
        guard let t = Performance.startTrace(name: "assignment_speech") else { return }
        t.setValue(r.path.rawValue, forAttribute: "path")
        t.setValue(r.outcome, forAttribute: "outcome")
        if let ms = r.startMs, ms.isFinite { t.setValue(Int64(min(max(0, ms.rounded()), 600_000)), forMetric: "start_ms") }
        t.stop()
    }

    /// Spoken audio plays over other sound and lowers it, and keeps playing with the ring switch on silent.
    static func activateAudio() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
    }
}

/// The phone's own speech synthesizer: works offline, no AI.
@MainActor
final class OnDeviceVoice: NSObject, AssignmentVoice, AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()
    private let turns = SpeechTurns()

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    /// Waits for any line still playing to end, then asks again whether this one is wanted, so a
    /// line that waited behind another never plays once it is no longer the mission's.
    func speak(_ text: String, ifStillWanted stillWanted: @MainActor () -> Bool) async -> Double? {
        await turns.waitForTurn()
        guard stillWanted() else { return nil }
        AssignmentSpeaker.activateAudio()
        let utterance = AVSpeechUtterance(string: text)
        let requested = Date()
        let heard = await turns.run(utterance) { synthesizer.speak(utterance) }
        return heard ? Date().timeIntervalSince(requested) * 1000 : nil
    }

    /// Stops the line playing and every line queued after it, also when the synthesizer never
    /// calls back.
    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
        turns.endAll()
    }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance)
        Task { @MainActor in self.turns.didStart(id) }
    }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance)
        Task { @MainActor in self.turns.didEnd(id) }
    }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        let id = ObjectIdentifier(utterance)
        Task { @MainActor in self.turns.didEnd(id) }
    }
}

/// Which line the phone's voice is on: each synthesizer callback answers only its own line, and a
/// new line waits until the one before has ended. The line is held until it ends, so its identity
/// is never reused meanwhile.
@MainActor
final class SpeechTurns {
    private var current: AnyObject?
    private var started: CheckedContinuation<Bool, Never>?
    private var waiters: [CheckedContinuation<Void, Never>] = []

    /// True while a line is playing or waiting to start.
    var busy: Bool { current != nil }

    /// Returns once no line is playing or waiting to start.
    func waitForTurn() async {
        while current != nil { await withCheckedContinuation { waiters.append($0) } }
    }

    /// Starts a line; true once it is heard, false when it ended before it started.
    func run(_ line: AnyObject, start: () -> Void) async -> Bool {
        current = line
        return await withCheckedContinuation { c in
            started = c
            start()
        }
    }

    func didStart(_ id: ObjectIdentifier) {
        guard let current, ObjectIdentifier(current) == id else { return }
        started?.resume(returning: true)
        started = nil
    }

    func didEnd(_ id: ObjectIdentifier) {
        guard let current, ObjectIdentifier(current) == id else { return }
        endAll()
    }

    /// Ends the line on the spot and lets every waiting line take its turn.
    func endAll() {
        started?.resume(returning: false)
        started = nil
        current = nil
        let waiting = waiters
        waiters = []
        waiting.forEach { $0.resume() }
    }
}

/// The AI Logic voice: the published prompt template named by Remote Config (it holds the voice
/// model, the voice and the audio settings, and speaks the text's own language). Its only input is
/// the approved plan text. Any failure (an HTTP 500 from the server's model guard included) gives
/// nil, and the speaker falls back to the phone's own voice.
@MainActor
final class CloudVoice: AssignmentVoice {
    private let templateId: String
    private var player: AVAudioPlayer?
    static let timeoutSeconds: Double = 10

    init(templateId: String) { self.templateId = templateId }

    /// The template takes 1 to 600 characters of text.
    nonisolated static func fitsTemplate(_ text: String) -> Bool { (1...600).contains(text.count) }

    func speak(_ text: String, ifStillWanted stillWanted: @MainActor () -> Bool) async -> Double? {
        guard Self.fitsTemplate(text), !stopped else { return nil }
        let requested = Date()
        let model = AIClient.make(useLimitedUseTokens: true).templateGenerativeModel()
        let templateId = templateId
        let wav = await Timeout.run(seconds: Self.timeoutSeconds) {
            try? await model.generateContent(templateID: templateId, inputs: ["text": text])
                .inlineDataParts.first { $0.mimeType.hasPrefix("audio/") }?.data
        }
        // The fetch takes seconds: a stop or a dropped mission meanwhile plays nothing.
        guard !stopped, stillWanted(), let data = wav ?? nil, let player = try? AVAudioPlayer(data: data) else { return nil }
        AssignmentSpeaker.activateAudio()
        self.player = player
        guard player.play() else { return nil }
        return Date().timeIntervalSince(requested) * 1000
    }

    private var stopped = false

    func stop() {
        stopped = true
        player?.stop()
        player = nil
    }
}
