import AVFoundation
import FirebaseAILogic
import FirebasePerformance
import Foundation
import PLSCore

/// A voice that speaks one line and returns the milliseconds until the sound started, or nil if
/// it could not speak.
@MainActor
protocol AssignmentVoice: AnyObject {
    func speak(_ text: String) async -> Double?
}

/// One spoken line, for the `assignment_speech` trace: which voice, whether it spoke, how fast.
struct SpeechRecord: Equatable, Sendable {
    var path: SpokenAssignment.Path
    var outcome: String              // "spoken" or "failed"
    var startMs: Double?
}

/// Speaks a new assignment while the app is open (P-06 push brings it to a locked screen later).
/// The words are command's approved plan only (`SpokenAssignment`). The cloud voice is used only
/// when `tts_model_ios` names a model and the phone is online; any failure falls back to the
/// phone's own voice. Every attempt is recorded, so the two voices can be compared on real numbers.
@MainActor
final class AssignmentSpeaker {
    private let onDevice: AssignmentVoice
    private let makeCloud: (String) -> AssignmentVoice
    private let record: (SpeechRecord) -> Void
    private var lastSpoken: Assignment?

    init(onDevice: AssignmentVoice = OnDeviceVoice(),
         makeCloud: @escaping (String) -> AssignmentVoice = { CloudVoice(model: $0) },
         record: @escaping (SpeechRecord) -> Void = AssignmentSpeaker.trace) {
        self.onDevice = onDevice
        self.makeCloud = makeCloud
        self.record = record
    }

    func update(_ assignment: Assignment?, cloudModel: String, online: Bool, killCloud: Bool) async {
        guard SpokenAssignment.shouldSpeak(previous: lastSpoken, current: assignment), let assignment else { return }
        lastSpoken = assignment
        let text = SpokenAssignment.text(assignment)
        if SpokenAssignment.path(cloudModel: cloudModel, online: online, killCloud: killCloud) == .cloud {
            let start = await makeCloud(cloudModel.trimmingCharacters(in: .whitespaces)).speak(text)
            record(SpeechRecord(path: .cloud, outcome: start == nil ? "failed" : "spoken", startMs: start))
            if start != nil { return }
        }
        let start = await onDevice.speak(text)
        record(SpeechRecord(path: .onDevice, outcome: start == nil ? "failed" : "spoken", startMs: start))
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
    private var started: CheckedContinuation<Double?, Never>?
    private var requestedAt = Date()

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func speak(_ text: String) async -> Double? {
        AssignmentSpeaker.activateAudio()
        requestedAt = Date()
        return await withCheckedContinuation { c in
            started = c
            synthesizer.speak(AVSpeechUtterance(string: text))
        }
    }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        Task { @MainActor in self.finish(Date().timeIntervalSince(self.requestedAt) * 1000) }
    }

    nonisolated func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.finish(nil) }
    }

    private func finish(_ ms: Double?) {
        started?.resume(returning: ms)
        started = nil
    }
}

/// The AI Logic voice model named by Remote Config. Its input is the approved plan text only.
@MainActor
final class CloudVoice: AssignmentVoice {
    private let model: String
    private var player: AVAudioPlayer?
    static let voiceName = "Kore"
    static let timeoutSeconds: Double = 10

    init(model: String) { self.model = model }

    func speak(_ text: String) async -> Double? {
        let requested = Date()
        let config = GenerationConfig(responseModalities: [.audio], speechConfig: SpeechConfig(voiceName: Self.voiceName, languageCode: "en-US"))
        let generator = AIClient.make(useLimitedUseTokens: true).generativeModel(modelName: model, generationConfig: config)
        let wav = await Timeout.run(seconds: Self.timeoutSeconds) {
            try? await generator.generateContent(text).inlineDataParts.first { $0.mimeType.hasPrefix("audio/") }?.data
        }
        guard let data = wav ?? nil, let player = try? AVAudioPlayer(data: data) else { return nil }
        AssignmentSpeaker.activateAudio()
        self.player = player
        guard player.play() else { return nil }
        return Date().timeIntervalSince(requested) * 1000
    }
}
