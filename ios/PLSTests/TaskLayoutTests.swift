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

    static let assignmentLine = "Your assignment changes only when command approves."
    /// The type sizes checked: the default and the largest Settings offers.
    nonisolated static let sizes: [UIContentSizeCategory] = [.large, .accessibilityExtraExtraExtraLarge]

    /// A phone joined to a real (not practice) drill, so the screen shows the assignment line and both links.
    func joinedModel() async throws -> AppModel {
        let join = AppJoinTests()
        let m = join.model(FakeJoinBackend(), FakeMissionReader(docs: try join.drillDocs()))
        let dir = try tempDir()
        let store = try EventStore(server: FakeEventServer(), outboxURL: dir.appendingPathComponent("outbox.json"))
        m.attach(store: store, identity: try DeviceIdentity(directory: dir), screen: try BundledConstants.evidenceScreen())
        await m.trySignIn()
        try #require(m.mission?.isPractice == false)
        return m
    }

    /// The task screen as the app shows it, with its Map and Ready check links in the navigation bar,
    /// at the given type size.
    func showWithLinks(_ model: AppModel, size: UIContentSizeCategory) throws -> (UIWindow, UIView) {
        Self.automation(true)
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(origin: .zero, size: Self.screen)
        let host = UIHostingController(rootView: NavigationStack {
            TaskView(model: model).modifier(TaskLinks(hasMission: model.mission != nil))
        })
        host.traitOverrides.preferredContentSizeCategory = size
        window.rootViewController = host
        window.makeKeyAndVisible()
        return (window, host.view)
    }

    /// The frame of the one element with this label.
    func frame(of label: String, under root: UIView, sourceLocation: SourceLocation = #_sourceLocation) throws -> CGRect {
        let all = elements(under: root)
        return try #require(all.first { $0.label == label }?.frame,
                            "no element labelled \(label); labels: \(all.map(\.label))", sourceLocation: sourceLocation)
    }

    /// The links' capsule: both links, with room for the glass around them.
    func linksPill(under root: UIView) throws -> CGRect {
        try frame(of: "Map", under: root).union(frame(of: "Ready check", under: root)).insetBy(dx: -8, dy: -8)
    }

    /// The scroll view under `root`.
    func scrollView(under root: UIView) -> UIScrollView? {
        if let scroll = root as? UIScrollView { return scroll }
        for child in root.subviews { if let found = scrollView(under: child) { return found } }
        return nil
    }

    /// How many pixels in `rect` are light enough to be text on the dark screen, as the window draws it.
    func lightPixels(in rect: CGRect, of window: UIWindow) throws -> Int {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        var complete = false
        let image = UIGraphicsImageRenderer(bounds: window.bounds, format: format).image { _ in
            complete = window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        // A snapshot missing part of the screen would count as no light pixels there.
        try #require(complete, "the window's snapshot is incomplete")
        let cg = try #require(image.cgImage)
        let width = cg.width, height = cg.height
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        let drawn = bytes.withUnsafeMutableBytes { buffer -> Bool in
            guard let context = CGContext(data: buffer.baseAddress, width: width, height: height, bitsPerComponent: 8,
                                          bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        try #require(drawn)
        let area = rect.integral.intersection(CGRect(x: 0, y: 0, width: width, height: height))
        // A band off the screen has nothing drawn in it to count.
        try #require(!area.isNull && !area.isEmpty, "\(rect) is off the \(width) by \(height) screen")
        var count = 0
        for y in Int(area.minY)..<Int(area.maxY) {
            for x in Int(area.minX)..<Int(area.maxX) {
                let i = (y * width + x) * 4
                let light = (0.299 * Double(bytes[i]) + 0.587 * Double(bytes[i + 1]) + 0.114 * Double(bytes[i + 2])) / 255
                if light > 0.35 { count += 1 }
            }
        }
        return count
    }

    /// Opened, the screen puts the assignment line under the Map and Ready check links, at the default
    /// and the largest type size.
    @Test(arguments: sizes) func theAssignmentLineStartsBelowTheLinks(size: UIContentSizeCategory) async throws {
        let m = try await joinedModel()
        let (window, root) = try showWithLinks(m, size: size)
        defer { close(window) }
        try await settle(window)
        let line = try frame(of: Self.assignmentLine, under: root)
        let pill = try linksPill(under: root)
        #expect(line.minY >= pill.maxY, "line \(line), links \(pill)")
    }

    /// Scrolled (by the searcher, by the keyboard coming up for the report box, or to a new receipt),
    /// the assignment line goes out of view at the bar: none of it is drawn beside or behind the links.
    @Test(arguments: sizes) func aScrolledAssignmentLineIsNotDrawnUnderTheLinks(size: UIContentSizeCategory) async throws {
        let m = try await joinedModel()
        let (window, root) = try showWithLinks(m, size: size)
        defer { close(window) }
        try await settle(window)
        let pill = try linksPill(under: root)
        let scroll = try #require(scrollView(under: root))
        /// Scrolls so the line's top is at `top` on screen, and gives the line's frame there.
        func moveLine(to top: CGFloat) async throws -> CGRect {
            scroll.contentOffset.y += try frame(of: Self.assignmentLine, under: root).minY - top
            try await settle(window)
            return try frame(of: Self.assignmentLine, under: root)
        }
        /// The part of a band at `y` that is left of the links, across the line's width.
        func beside(_ line: CGRect, y: CGFloat) -> CGRect {
            CGRect(x: line.minX, y: y, width: pill.minX - 4 - line.minX, height: min(line.height, pill.height))
        }
        // Just under the bar, the counter sees the line, so a zero below is about the bar, not the counter.
        let below = try await moveLine(to: pill.maxY + 16)
        try #require(beside(below, y: below.minY).width >= 40, "band beside the links \(beside(below, y: below.minY))")
        #expect(try lightPixels(in: beside(below, y: below.minY), of: window) > 50, "line \(below), links \(pill)")
        // Across the links' band, none of it is drawn.
        let line = try await moveLine(to: pill.minY)
        // The line's first row of text fills the band, not a sliver at its edge.
        try #require(abs(line.minY - pill.minY) <= 2 && line.maxY >= pill.maxY - 8, "line \(line), links \(pill)")
        let band = beside(line, y: pill.minY)
        #expect(try lightPixels(in: band, of: window) == 0, "line \(line), links \(pill), band \(band)")
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
