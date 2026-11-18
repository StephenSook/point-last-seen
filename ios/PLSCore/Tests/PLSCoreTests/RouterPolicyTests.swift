import Testing
@testable import PLSCore

@Suite struct RouterPolicyTests {
    func input(online: Bool = true, onDevice: Bool = true, locale: Bool = true, tokens: Int = 1000, context: Int = 4096,
               consent: Bool = true, kill: Bool = false) -> RouterInput {
        RouterInput(taskClass: .fieldReport, networkOnline: online, onDeviceAvailable: onDevice, localeSupported: locale,
                    estimatedTokens: tokens, contextSize: context, tokenBudgetFraction: 0.5, cloudConsent: consent, killCloud: kill)
    }

    @Test func onDeviceFirst() {
        #expect(RouterPolicy.decide(input()) == RouteDecision(path: .onDevice, reason: .onDeviceDefault))
        #expect(RouterPolicy.decide(input(online: false)) == RouteDecision(path: .onDevice, reason: .noNetwork))
    }

    @Test func cloudCarriesTheReasonStepOneFailed() {
        #expect(RouterPolicy.decide(input(onDevice: false)) == RouteDecision(path: .cloud, reason: .onDeviceUnavailable))
        #expect(RouterPolicy.decide(input(locale: false)) == RouteDecision(path: .cloud, reason: .localeUnsupported))
        #expect(RouterPolicy.decide(input(tokens: 2049)) == RouteDecision(path: .cloud, reason: .overTokenBudget))
        #expect(RouterPolicy.decide(input(tokens: 2048)).path == .onDevice)
    }

    @Test func rulesWhenCloudIsNotAllowed() {
        #expect(RouterPolicy.decide(input(online: false, onDevice: false)) == RouteDecision(path: .rules, reason: .onDeviceUnavailable))
        #expect(RouterPolicy.decide(input(onDevice: false, consent: false)).path == .rules)
        #expect(RouterPolicy.decide(input(onDevice: false, kill: true)).path == .rules)
        #expect(RouterPolicy.decide(input(context: 0)).path == .cloud)
    }

    @Test func afterFailureNeverReturnsCloudAfterBlock() {
        for f in [ReadFailure.guardrailBlock, .refusal] {
            for s in ReadStage.allCases {
                for p in RoutePath.allCases {
                    #expect(RouterPolicy.afterFailure(f, path: p, stage: s).isCloud == false)
                }
            }
        }
        #expect(RouterPolicy.afterFailure(.guardrailBlock, path: .onDevice, stage: .guided) == .stage(.permissiveText))
        #expect(RouterPolicy.afterFailure(.guardrailBlock, path: .onDevice, stage: .permissiveText) == .stage(.deterministicParser))
        #expect(RouterPolicy.afterFailure(.parseFailed, path: .onDevice, stage: .deterministicParser) == .pickList)
    }

    @Test func aModelThatIsNotReadyMayRerouteOnlyFromTheGuidedStage() {
        #expect(RouterPolicy.afterFailure(.unavailable, path: .onDevice, stage: .guided) == .rerouteWithoutOnDevice)
        #expect(RouterPolicy.afterFailure(.unavailable, path: .onDevice, stage: .guided).isCloud)
        #expect(RouterPolicy.afterFailure(.unavailable, path: .onDevice, stage: .permissiveText) == .stage(.deterministicParser))
        #expect(RouterPolicy.afterFailure(.contextExceeded, path: .cloud, stage: .guided) == .stage(.deterministicParser))
    }

    @Test func cloudFailuresFallToTheParser() {
        for f in [ReadFailure.network, .appCheckRefused, .other, .parseFailed, .cancelled] {
            #expect(RouterPolicy.afterFailure(f, path: .cloud, stage: .guided) == .stage(.deterministicParser))
        }
        #expect(RouterPolicy.afterFailure(.other, path: .rules, stage: .evidenceProtocol) == .pickList)
    }

    @Test func routeRecordEncodesEveryKeyIncludingNullBlocked() throws {
        let r = RouteRecord(platform: .ios, path: .onDevice, stage: .guided, model: "apple-system", reason: .onDeviceDefault,
                            latencyMs: 812, sdkReported: false, blocked: nil, decidedAtMs: 1)
        guard case let .object(o) = try JSONValue(encoding: r) else { Issue.record("not an object"); return }
        #expect(Set(o.keys) == ["platform", "path", "stage", "model", "reason", "latencyMs", "sdkReported", "blocked", "decidedAtMs"])
        #expect(o["blocked"] == .null)
        #expect(o["path"] == .string("on_device"))
        #expect(o["sdkReported"] == .bool(false))
    }
}
