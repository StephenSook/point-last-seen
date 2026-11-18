import Testing
@testable import PLSCore

@Suite struct PoaClassTests {
    @Test func classifyGivesSixClasses() {
        #expect(PoaClass.classify(poa: 0.31, maxPoa: 0.31) == 5)
        #expect(PoaClass.classify(poa: 0.0, maxPoa: 0.31) == 0)
        #expect(PoaClass.classify(poa: 0.155, maxPoa: 0.31) == 3)
        #expect(PoaClass.classify(poa: 0.1, maxPoa: 0.0) == 0)
    }

    @Test func badNumbersFallToTheDarkestClass() {
        #expect(PoaClass.classify(poa: .nan, maxPoa: 0.3) == 0)
        #expect(PoaClass.classify(poa: 0.2, maxPoa: .nan) == 0)
        #expect(PoaClass.classify(poa: -0.1, maxPoa: 0.3) == 0)
        #expect(PoaClass.classify(poa: 0.5, maxPoa: 0.3) == 5)
    }

    @Test func percentLabelIsRounded() {
        #expect(PoaClass.percentLabel(0.3104) == "31%")
        #expect(PoaClass.percentLabel(0.004) == "<1%")
        #expect(PoaClass.percentLabel(0) == "0%")
    }
}
