import FoundationModels

/// Prompt text for the report reader. Neutral words only ("item", "the subject", "condition"),
/// because the on-device guardrails react to some search-and-rescue words. A report with a
/// possible-evidence term never reaches a model at all.
enum ReportPrompt {
    static let version = "pls-report-v1"

    static let guided = Instructions("""
    You read one short report from a search team during a training drill. Fill every field from the report only.
    Numbers spoken as words are numbers: "point eight" is 0.8, "forty five" is 45.
    For segmentIds list only ids the report itself names. The segmentHere and teamAssignment tools tell you where the \
    team is and what it was assigned; use them to understand the report, not to add ids.
    For matchesProfile compare the report with the subjectDescription tool.
    Copy evidenceQuote word for word from the report.
    """)

    static let permissive = Instructions("""
    Rewrite the report as one line in this form and nothing else: KIND|SEGMENTS|COVERAGE
    KIND is one of cleared, sighting, clue, found, unclear. SEGMENTS is the two-letter segment ids the report names, \
    separated by spaces, or none. COVERAGE is the coverage number the report states, or none.
    """)
}
