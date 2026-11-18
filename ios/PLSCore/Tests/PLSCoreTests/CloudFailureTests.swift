import Testing
@testable import PLSCore

@Suite struct CloudFailureTests {
    @Test func appCheckRefusalIsItsOwnFailure() {
        #expect(CloudFailure.classify(.apiError, statusCode: 401) == .appCheckRefused)
        #expect(CloudFailure.classify(.apiError, statusCode: 403) == .appCheckRefused)
        #expect(CloudFailure.classify(.apiError, statusCode: 500) == .other)
        #expect(CloudFailure.classify(.networkFailure, statusCode: nil) == .network)
        #expect(CloudFailure.classify(.serviceUnavailable, statusCode: 503) == .network)
        #expect(CloudFailure.classify(.invalidResponse, statusCode: nil) == .parseFailed)
        #expect(CloudFailure.classify(.modelNotFound, statusCode: 404) == .other)
    }
}
