import Testing
@testable import PLSCore

/// Proof is a glyph, not a sentence: the link state and each report's route are shown by shape
/// and number, with the words in the VoiceOver label.
@Suite struct LinkStateTests {
    @Test func fourStatesDifferInShape() {
        let states = [LinkState.make(online: true, waiting: 0), .make(online: false, waiting: 0),
                      .make(online: false, waiting: 2), .make(online: true, waiting: 2)]
        #expect(Set(states.map(\.symbol)).count == 4)
        #expect(states.map(\.symbol) == ["antenna.radiowaves.left.and.right", "antenna.radiowaves.left.and.right.slash",
                                         "tray.and.arrow.up", "arrow.triangle.2.circlepath"])
        #expect(states.map(\.badge) == [nil, nil, 2, 2])
    }

    @Test func voiceOverSaysItInWords() {
        #expect(LinkState.make(online: true, waiting: 0).label == "Signal. Nothing waiting.")
        #expect(LinkState.make(online: false, waiting: 0).label == "No signal. Nothing waiting.")
        #expect(LinkState.make(online: false, waiting: 2).label == "No signal. 2 reports waiting to send.")
        #expect(LinkState.make(online: false, waiting: 1).label == "No signal. 1 report waiting to send.")
        #expect(LinkState.make(online: true, waiting: 3).label == "Sending 3 reports.")
    }
}

@Suite struct RouteMarkTests {
    func route(_ path: RoutePath, _ stage: ReadStage) -> RouteRecord {
        RouteRecord(platform: .ios, path: path, stage: stage, model: "m", reason: .noNetwork, latencyMs: 1, sdkReported: false, blocked: nil, decidedAtMs: 0)
    }

    @Test func eachRouteHasItsGlyphAndWords() {
        #expect(RouteMark.make(route(.onDevice, .guided)) == RouteMark(symbol: "iphone", label: "Read on this phone."))
        #expect(RouteMark.make(route(.cloud, .guided)) == RouteMark(symbol: "cloud", label: "Read in the cloud."))
        #expect(RouteMark.make(route(.rules, .deterministicParser)) == RouteMark(symbol: "list.bullet.rectangle", label: "Read by the phone's rules. No model."))
        #expect(RouteMark.make(route(.rules, .evidenceProtocol)) == RouteMark(symbol: "hand.raised", label: "Not sent to any model."))
        #expect(RouteMark.make(route(.onDevice, .permissiveText)).symbol == "iphone")
    }
}
