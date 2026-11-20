import PLSCore
import SwiftUI
import UIKit

/// The release route check: one fixed drill sentence read on each route by the app's own reader,
/// Apple's on-device model first (no network, no cloud), then the cloud route, with both route
/// records shown and saved to the app's Documents folder. Practice incidents only.
struct RouteCheckView: View {
    @Bindable var model: AppModel
    @Environment(\.fieldTheme) private var theme
    @State private var running = false
    @State private var lines: [String] = []
    @State private var done = false

    struct Result: Codable {
        struct Route: Codable {
            var route: String
            var record: RouteRecord
            var kind: String
            var segmentIds: [String]
            /// Why each model stage was not used (empty when the first stage answered).
            var notes: [String]
        }
        var appVersion: String
        var build: String
        var commit: String
        var device: String
        var ranAtMs: Double
        var sentence: String
        var routes: [Route]
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Reads one fixed drill sentence on each route: on this iPhone with no signal, then in the cloud. "
                     + "The cloud route sends that sentence and the drill's sample description to Google's model.")
                    .foregroundStyle(theme.text(.secondary))
                if let mission = model.mission, model.canRouteCheck {
                    Text("Sentence: \(AppModel.routeCheckSentence(mission))")
                    Button("Run the route check") { Task { await run(mission) } }
                        .disabled(running)
                        .accessibilityIdentifier("route-check-run")
                } else {
                    Text("Join a practice drill first.")
                }
                if running { ProgressView("Reading") }
                ForEach(lines, id: \.self) { Text($0) }
                if done { Text("Done").accessibilityIdentifier("route-check-done") }
            }
            .font(.title3)
            .padding()
        }
        .background(theme.backgroundColor)
        .fieldNavigation("Route check")
    }

    private func run(_ mission: Mission) async {
        running = true
        done = false
        lines = []
        defer { running = false }
        var routes: [Result.Route] = []
        for route in AppModel.CheckRoute.allCases {
            let title = route == .onDevice ? "On this iPhone, no signal" : "In the cloud"
            guard let outcome = await model.routeCheck(route) else {
                lines.append("\(title): not read.")
                continue
            }
            let r = outcome.route
            let who = EchoText.routeLine(r) + (r.path == .rules ? "" : " (\(r.model))")
            let ids = outcome.reading.segmentIds
            let segments = ids.isEmpty ? "no segment" : (ids.count == 1 ? "segment " : "segments ") + ids.joined(separator: " ")
            // Plain words on screen; the saved file keeps the exact route record.
            lines.append("\(title): \(who). \(EchoText.seconds(r.latencyMs)). Why: \(EchoText.reasonWords(r.reason)). "
                         + "Read as \(outcome.reading.kind.rawValue), \(segments).")
            routes.append(Result.Route(route: route.rawValue, record: r, kind: outcome.reading.kind.rawValue,
                                       segmentIds: outcome.reading.segmentIds, notes: outcome.stageNotes))
        }
        let info = Bundle.main.infoDictionary ?? [:]
        let result = Result(appVersion: info["CFBundleShortVersionString"] as? String ?? "", build: info["CFBundleVersion"] as? String ?? "",
                            commit: info["PLSBuildCommit"] as? String ?? "unknown",
                            device: "\(UIDevice.current.model) iOS \(UIDevice.current.systemVersion)",
                            ranAtMs: Date().timeIntervalSince1970 * 1000, sentence: AppModel.routeCheckSentence(mission), routes: routes)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let file = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("route-check-\(Int(result.ranAtMs)).json")
        if let data = try? encoder.encode(result), (try? data.write(to: file)) != nil {
            lines.append("Saved \(file.lastPathComponent)")
        } else {
            lines.append("The result could not be saved.")
        }
        done = true
    }
}
