import Foundation
import PLSCore
import SwiftUI
import Testing
import UIKit
@testable import PLS

/// After Send, the searcher sees what the phone made of the report without scrolling: the newest
/// receipt is on screen whole, on an iPhone 17 Pro sized screen (402 by 874 points).
@MainActor
@Suite(.serialized) struct TaskLayoutTests {
    static let screen = CGSize(width: 402, height: 874)

    /// Every report reads as the take's did: a cleared segment at coverage 0.7, suggested by Apple's
    /// model on this iPhone, with the numbers read by rules. The photo button shows, as on iOS 27.
    func model() -> AppModel {
        AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }),
                 speaker: AssignmentSpeaker(onDevice: FakeVoice(), makeCloud: { _ in FakeVoice() }, record: { _ in }),
                 uid: { "uid-1" }, measurements: FakeMeasurementWriter(),
                 readReport: { text, _, _, _ in
                     var reading = ReportReading.unclear(quote: text)
                     reading.kind = .cleared
                     reading.coverage = 0.7
                     let route = RouteRecord(platform: .ios, path: .onDevice, stage: .guided, model: "apple-on-device",
                                             reason: .onDeviceDefault, latencyMs: 900, sdkReported: false, blocked: nil, decidedAtMs: 0)
                     return ReadOutcome(reading: reading, route: route, validation: .ok, numbersFromRules: true)
                 },
                 photoReaderAvailable: { true },
                 joinBackend: FakeJoinBackend(), missionReader: FakeMissionReader(docs: nil), pushTopics: FakePushTopics(),
                 alerts: FakeAlerts(), defaults: UserDefaults(suiteName: "layout-\(UUID().uuidString)")!)
    }

    func tempDir() throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("layout-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// SwiftUI builds its accessibility tree only while automation is on, as under a UI test. Test process only.
    static func automation(_ on: Bool) {
        guard let lib = dlopen("/usr/lib/libAccessibility.dylib", RTLD_NOW), let set = dlsym(lib, "_AXSSetAutomationEnabled") else { return }
        unsafeBitCast(set, to: (@convention(c) (Bool) -> Void).self)(on)
    }

    /// The task screen as the app shows it (in the navigation stack), in its own window on the app's scene.
    func show(_ model: AppModel) throws -> (UIWindow, UIView) {
        Self.automation(true)
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(origin: .zero, size: Self.screen)
        let host = UIHostingController(rootView: NavigationStack { TaskView(model: model) })
        window.rootViewController = host
        window.makeKeyAndVisible()
        return (window, host.view)
    }

    func close(_ window: UIWindow) {
        window.isHidden = true
        Self.automation(false)
    }

    /// Lets SwiftUI apply the new state, lay out and finish any scroll.
    func settle(_ window: UIWindow) async throws {
        for _ in 0..<10 {
            window.layoutIfNeeded()
            try await Task.sleep(for: .milliseconds(100))
        }
    }

    /// Every labelled accessibility element under `root`, with its frame on screen.
    func elements(under root: NSObject) -> [(label: String, frame: CGRect)] {
        var found: [(String, CGRect)] = []
        var queue: [NSObject] = [root]
        var seen = Set<ObjectIdentifier>()
        while let item = queue.popLast() {
            guard seen.insert(ObjectIdentifier(item)).inserted else { continue }
            if let label = item.accessibilityLabel, !label.isEmpty { found.append((label, item.accessibilityFrame)) }
            if let children = item.accessibilityElements as? [NSObject] { queue += children }
            let count = item.accessibilityElementCount()
            if count != NSNotFound, count > 0 { queue += (0..<count).compactMap { item.accessibilityElement(at: $0) as? NSObject } }
            if let view = item as? UIView { queue += view.subviews }
        }
        return found
    }

    /// Each line is drawn, and drawn inside the screen's safe area.
    func expectOnScreen(_ lines: [String], in window: UIWindow, root: UIView,
                        sourceLocation: SourceLocation = #_sourceLocation) throws {
        let visible = window.bounds.inset(by: window.safeAreaInsets)
        let all = elements(under: root)
        for line in lines {
            let frames = all.filter { $0.label == line }.map(\.frame)
            // The line is drawn at all, so a miss below is about where it is.
            try #require(!frames.isEmpty, "no element labelled \(line); labels: \(all.map(\.label))", sourceLocation: sourceLocation)
            #expect(frames.contains { visible.contains($0) }, "\(line) at \(frames), visible \(visible)", sourceLocation: sourceLocation)
        }
    }

    /// The receipt's lines all sit inside the screen's safe area with no scroll by the searcher, so
    /// the film shows the report and its result in one frame. The take's screen: the source line on
    /// (as for filming), the photo button, and a report that reads as on the phone.
    @Test func theNewestReceiptIsOnScreenWholeAfterSend() async throws {
        let sources = UserDefaults.standard.object(forKey: "pls.showSources")
        UserDefaults.standard.set(true, forKey: "pls.showSources")
        defer { UserDefaults.standard.set(sources, forKey: "pls.showSources") }
        let m = model()
        #expect(await m.startPractice(directory: try tempDir()) == nil)
        #expect(m.canReadPhoto)
        let (window, root) = try show(m)
        defer { close(window) }
        try await settle(window)
        #expect(await m.submit("Cleared segment BO, coverage point seven.", inputMethod: .typed) == "")
        try await settle(window)

        let entry = try #require(m.missionEntries.last)
        let route = try #require(entry.doc.route)
        try expectOnScreen([try #require(entry.doc.rawText), EchoText.effectLine(entry.doc.effect, type: entry.doc.type, practice: true),
                            EchoText.numbersByRules, EchoText.routeLine(route), EchoText.deliveryLine(entry.state)],
                           in: window, root: root)
    }

    /// The phone's text input view under `root` (the report box).
    func textInput(under root: UIView) -> (UIView & UITextInput)? {
        if let input = root as? (UIView & UITextInput), input.isUserInteractionEnabled { return input }
        for child in root.subviews { if let found = textInput(under: child) { return found } }
        return nil
    }

    /// Typing in the report box redraws only the box: each keystroke does not re-run the whole
    /// task screen, whose reads include Apple's model check for the photo button and every receipt.
    @Test func typingRedrawsOnlyTheReportBox() async throws {
        final class Count { var photoChecks = 0 }
        let count = Count()
        let m = AppModel(signIn: SignIn(isSignedIn: { true }, attempt: { true }),
                         speaker: AssignmentSpeaker(onDevice: FakeVoice(), makeCloud: { _ in FakeVoice() }, record: { _ in }),
                         uid: { "uid-1" }, measurements: FakeMeasurementWriter(),
                         photoReaderAvailable: { count.photoChecks += 1; return true },
                         joinBackend: FakeJoinBackend(), missionReader: FakeMissionReader(docs: nil), pushTopics: FakePushTopics(),
                         alerts: FakeAlerts(), defaults: UserDefaults(suiteName: "typing-\(UUID().uuidString)")!)
        #expect(await m.startPractice(directory: try tempDir()) == nil)
        let (window, root) = try show(m)
        defer { close(window) }
        try await settle(window)
        let box = try #require(textInput(under: root))
        #expect(box.becomeFirstResponder())
        try await settle(window)
        let before = count.photoChecks
        let typed = "cleared BO"
        for character in typed {
            box.insertText(String(character))
            try await Task.sleep(for: .milliseconds(60))
            window.layoutIfNeeded()
        }
        try await settle(window)
        // The keystrokes reached the box, so a low count is not a box that took no text.
        let range = try #require(box.textRange(from: box.beginningOfDocument, to: box.endOfDocument))
        #expect(box.text(in: range) == typed)
        #expect(count.photoChecks - before <= 2, "\(count.photoChecks - before) photo checks for \(typed.count) keystrokes")
    }

    /// A screen opened on earlier reports starts at the top, with the Report bar in view: only a
    /// report sent while the screen is open moves it.
    @Test func aScreenOpenedOnEarlierReportsStartsAtTheTop() async throws {
        let m = model()
        #expect(await m.startPractice(directory: try tempDir()) == nil)
        #expect(await m.submit("Cleared segment BO, coverage point seven.", inputMethod: .typed) == "")
        let (window, root) = try show(m)
        defer { close(window) }
        try await settle(window)
        try expectOnScreen(["Training drill. Nobody is missing.", "Report"], in: window, root: root)
    }

    /// An ended search's reports still draw on the scrolling screen, under the line that says it ended.
    @Test func anEndedSearchStillShowsItsReports() async throws {
        let join = AppJoinTests()
        let reader = FakeMissionReader(docs: try join.drillDocs())
        let m = join.model(FakeJoinBackend(), reader)
        let dir = try tempDir()
        let store = try EventStore(server: FakeEventServer(), outboxURL: dir.appendingPathComponent("outbox.json"))
        m.attach(store: store, identity: try DeviceIdentity(directory: dir), screen: try BundledConstants.evidenceScreen())
        await m.trySignIn()
        let segment = try #require(m.mission?.assignedSegmentIds.first)
        #expect(await m.submitPick(PickListChoice(kind: .clue, segmentId: segment, minutes: nil, searchers: nil)))
        reader.onIncident?(IncidentState(status: "closed", closedReason: "found"))
        let ended = try #require(m.endedSearch)
        let entry = try #require(m.endedEntries.last)
        let (window, root) = try show(m)
        defer { close(window) }
        try await settle(window)
        try expectOnScreen([ended.line, EchoText.effectLine(entry.doc.effect, type: entry.doc.type, practice: false)],
                           in: window, root: root)
    }
}
