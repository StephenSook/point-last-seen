import FoundationModels
import PLSCore

/// Prompt text for the report reader, from `PromptText` in Core, so the cloud allow-list test
/// covers the exact words sent. A report with a possible-evidence term never reaches a model.
enum ReportPrompt {
    static let version = "pls-report-v1"
    static let guidedText = PromptText.guided
    static let permissiveText = PromptText.permissive

    static let guided = Instructions(guidedText)
    static let permissive = Instructions(permissiveText)
}
