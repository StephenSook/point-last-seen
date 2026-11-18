import Foundation
import Testing

/// The field app is read at arm's length while walking: no text style below Title 3, and no
/// fixed point sizes (Dynamic Type only). Scans the app's and the widget's view sources.
@Suite struct FieldTextSizeTests {
    static let iosDir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

    static let tooSmall = ["largeTitle": false, "title": false, "title2": false, "title3": false, "headline": true,
                           "subheadline": true, "body": true, "callout": true, "footnote": true, "caption": true, "caption2": true]

    func swiftFiles(_ folder: String) -> [URL] {
        let root = Self.iosDir.appendingPathComponent(folder)
        guard let e = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else { return [] }
        return e.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    @Test func nothingBelowTitle3() throws {
        let files = swiftFiles("PLS/Views") + swiftFiles("PLSWidgets") + swiftFiles("PLSShared")
        #expect(files.count >= 10)                                       // the scan saw the views
        let style = try Regex(#"\.font\(\s*\.([A-Za-z0-9]+)"#)
        var problems: [String] = []
        for file in files {
            let text = try String(contentsOf: file, encoding: .utf8)
            for (n, line) in text.split(separator: "\n", omittingEmptySubsequences: false).enumerated() {
                for m in line.matches(of: style) {
                    let name = String(line[m.output[1].range!])
                    if name == "system" { problems.append("\(file.lastPathComponent):\(n + 1): fixed size") }
                    else if Self.tooSmall[name] == true { problems.append("\(file.lastPathComponent):\(n + 1): .\(name)") }
                }
            }
        }
        #expect(problems.isEmpty, "\(problems.joined(separator: "\n"))")
    }
}
