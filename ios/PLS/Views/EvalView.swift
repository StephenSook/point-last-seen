#if DEBUG
import CryptoKit
import PLSCore
import SwiftUI
import UIKit

/// The report-reading eval, in debug builds only: every report in the bundled answer key is read
/// twice by the app's own reader, once by the rules alone and once by Apple's on-device model, with
/// no network and no cloud. The result file goes to the app's Documents folder.
struct EvalView: View {
    static let keyName = "pls-drill-reports-v1"
    @Bindable var model: AppModel
    @State private var running = false
    @State private var status = ""
    @State private var lines: [String] = []
    @State private var done = false

    /// The bundled answer key and its SHA-256; nil when this build has none.
    static func loadKey(bundle: Bundle = .main) -> (key: EvalAnswerKey, sha256: String)? {
        guard let url = bundle.url(forResource: keyName, withExtension: "json"), let data = try? Data(contentsOf: url),
              let key = try? JSONDecoder().decode(EvalAnswerKey.self, from: data) else { return nil }
        return (key, hex(Data(SHA256.hash(data: data))))
    }

    static func hex(_ data: Data) -> String { data.map { String(format: "%02x", $0) }.joined() }

    /// The SHA-256 of the instructions Apple's model is given in the eval's reads, built the way the reader
    /// builds them from the eval's situation.
    static func promptSha256(_ mission: Mission) -> String {
        let text = FoundationModelRunner.onDeviceInstructionsText(ReportReader.tools(for: AppModel.evalSituation(mission, arm: .onDevice)))
        return hex(Data(SHA256.hash(data: Data(text.utf8))))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Report-reading eval (debug builds only)").font(.title3.bold())
                if let loaded = Self.loadKey() {
                    Text("\(loaded.key.answerKey): \(loaded.key.rows.count) reports, answers written by: \(loaded.key.writtenBy).")
                    if model.mission == nil { Text("Join a drill first: the reader needs its grid.") }
                    Button("Run both arms") { Task { await run(loaded.key, sha256: loaded.sha256) } }
                        .disabled(running || model.mission == nil)
                        .accessibilityIdentifier("eval-run")
                } else {
                    Text("No answer key in this build.")
                }
                if running { ProgressView(status) }
                ForEach(lines, id: \.self) { Text($0) }
                if done { Text("Done").accessibilityIdentifier("eval-done") }
            }
            .font(.title3)
            .padding()
        }
        .fieldNavigation("Eval")
    }

    private func run(_ key: EvalAnswerKey, sha256: String) async {
        running = true
        done = false
        lines = []
        defer { running = false }
        let rows = key.evalRows
        var outputs: [AppModel.EvalArm: [String: EvalOutput]] = [:]
        for arm in AppModel.EvalArm.allCases {
            for (i, row) in rows.enumerated() {
                status = "\(arm.rawValue): \(i + 1) of \(rows.count)"
                if let out = await model.evalRead(row.text, arm: arm) { outputs[arm, default: [:]][row.id] = out }
            }
        }
        let info = Bundle.main.infoDictionary ?? [:]
        let facts = EvalReport.RunFacts(
            answerKey: key.answerKey, answerKeySha256: sha256, writtenBy: key.writtenBy, grid: key.grid,
            appVersion: info["CFBundleShortVersionString"] as? String ?? "", build: info["CFBundleVersion"] as? String ?? "",
            commit: info["PLSBuildCommit"] as? String ?? "unknown",
            promptSha256: model.mission.map(Self.promptSha256) ?? "",
            device: "\(UIDevice.current.model) iOS \(UIDevice.current.systemVersion)", ranAtMs: Date().timeIntervalSince1970 * 1000)
        let report = EvalReport.make(rows: rows, facts: facts, onDevice: outputs[.onDevice] ?? [:], rulesOnly: outputs[.rulesOnly] ?? [:])
        for arm in report.arms {
            lines.append(String(format: "%@: %d of %d right (95%% %.2f to %.2f), %d read by a model, %d invalid, %d blocked",
                                arm.arm, arm.right, rows.count, arm.rightInterval[0], arm.rightInterval[1], arm.readByModel,
                                arm.summary.invalid, arm.summary.blocked))
        }
        lines.append(String(format: "Only on-device right: %d. Only rules right: %d. Exact McNemar p = %.3f",
                            report.paired.onDeviceOnly, report.paired.rulesOnly, report.paired.pValue))
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let file = docs.appendingPathComponent("eval-\(key.answerKey)-\(Int(facts.ranAtMs)).json")
        if let data = try? encoder.encode(report), (try? data.write(to: file)) != nil {
            lines.append("Saved \(file.lastPathComponent)")
        } else {
            lines.append("The result could not be saved.")
        }
        done = true
    }
}
#endif
