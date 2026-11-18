import Foundation
import Testing
@testable import PLSCore

@Suite struct ContrastTests {
    @Test func dayPairsClearTheirTargets() {
        #expect(Contrast.ratio("#FFFFFF", "#000000") >= 20.9)
        #expect(Contrast.ratio("#000000", "#FFB020") >= 11.4)
    }

    @Test func nightTextPairs() {
        #expect(Contrast.ratio("#FF5448", "#000000") >= 6.6)
        #expect(Contrast.ratio("#ED4138", "#000000") >= 5.4)
        let large = Contrast.ratio("#C93029", "#000000")
        #expect(large >= 3.0 && large < 4.5)                                     // 24 pt or icons only
    }

    @Test func nightRampIsLightnessOfRed() {
        #expect(FieldTheme.night.priorityRamp == ["#1F0605", "#3D0C0A", "#831B16", "#C93029", "#ED4138", "#FF5448"])
    }

    @Test func dayRampIsAGreyLadder() {
        #expect(FieldTheme.day.priorityRamp == ["#000000", "#2B2B2B", "#555555", "#808080", "#B3B3B3", "#FFFFFF"])
        #expect(FieldTheme.day.accent == "#FFB020")
    }

    @Test func nightTextStyleRefusesTheDarkRedBelow24pt() {
        #expect(FieldTheme.night.textColor(sizePt: 17, role: .tertiary) == "#ED4138")
        #expect(FieldTheme.night.textColor(sizePt: 24, role: .tertiary) == "#C93029")
    }

    @Test func everyTextColourInEachThemeClearsItsFloorOnBlack() {
        for theme in [FieldTheme.day, FieldTheme.night] {
            #expect(Contrast.ratio(theme.textColor(sizePt: 17, role: .primary), theme.background) >= 4.5)
            #expect(Contrast.ratio(theme.textColor(sizePt: 17, role: .secondary), theme.background) >= 4.5)
            #expect(Contrast.ratio(theme.textColor(sizePt: 17, role: .tertiary), theme.background) >= 4.5)
            #expect(Contrast.ratio(theme.onAccent, theme.accent) >= 4.5)
        }
    }
}
