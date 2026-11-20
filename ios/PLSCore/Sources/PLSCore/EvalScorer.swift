import Foundation

/// One labelled report for the report-reading eval: the words a searcher said, and the answers a
/// person wrote before seeing any model output. `group` keeps fresh sentences apart from ones the
/// prompt may have been tuned on ("fresh" or "seen").
public struct EvalRow: Codable, Sendable, Equatable {
    public var id: String
    public var group: String
    public var text: String
    public var kind: ReportKind
    public var segmentIds: [String]
    /// The place feature the report names; nil when the person left it out (then it is not scored).
    public var feature: Feature?

    public init(id: String, group: String, text: String, kind: ReportKind, segmentIds: [String], feature: Feature?) {
        self.id = id
        self.group = group
        self.text = text
        self.kind = kind
        self.segmentIds = segmentIds
        self.feature = feature
    }
}

/// What one arm made of one row: a reading, or none (an invalid reply); `blocked` when the read was refused.
public struct EvalOutput: Codable, Sendable, Equatable {
    public var reading: ReportReading?
    public var blocked: Bool
    /// Where it was read ("rules", "onDevice", "cloud") and how long it took, for the record.
    public var path: String?
    public var latencyMs: Double?

    public init(reading: ReportReading?, blocked: Bool, path: String? = nil, latencyMs: Double? = nil) {
        self.reading = reading
        self.blocked = blocked
        self.path = path
        self.latencyMs = latencyMs
    }
}

public struct EvalSummary: Codable, Sendable, Equatable {
    public var n: Int
    public var kindCorrect: Int
    public var segmentCorrect: Int
    /// Rows with a feature answer, and how many of those the arm got right.
    public var featureScored: Int
    public var featureCorrect: Int
    public var invalid: Int
    public var blocked: Int
    /// Rows whose kind or segments were wrong, or that gave no reading, in row order.
    public var misses: [String]
}

/// Scores an arm's readings against the person-written answers.
public enum EvalScorer {
    /// A row is right when the kind and the set of segment ids both match.
    public static func correct(_ row: EvalRow, _ output: EvalOutput?) -> Bool {
        guard let output, !output.blocked, let r = output.reading else { return false }
        return r.kind == row.kind && Set(r.segmentIds) == Set(row.segmentIds)
    }

    public static func score(rows: [EvalRow], outputs: [String: EvalOutput]) -> EvalSummary {
        var s = EvalSummary(n: rows.count, kindCorrect: 0, segmentCorrect: 0, featureScored: 0, featureCorrect: 0,
                            invalid: 0, blocked: 0, misses: [])
        for row in rows {
            if row.feature != nil { s.featureScored += 1 }
            guard let output = outputs[row.id] else { s.invalid += 1; s.misses.append(row.id); continue }
            if output.blocked { s.blocked += 1; s.misses.append(row.id); continue }
            guard let r = output.reading else { s.invalid += 1; s.misses.append(row.id); continue }
            let kindOK = r.kind == row.kind, segmentOK = Set(r.segmentIds) == Set(row.segmentIds)
            if kindOK { s.kindCorrect += 1 }
            if segmentOK { s.segmentCorrect += 1 }
            if let feature = row.feature, r.feature == feature { s.featureCorrect += 1 }
            if !(kindOK && segmentOK) { s.misses.append(row.id) }
        }
        return s
    }

    /// The same score for each group of rows.
    public static func scoreByGroup(rows: [EvalRow], outputs: [String: EvalOutput]) -> [String: EvalSummary] {
        Dictionary(grouping: rows, by: \.group).mapValues { score(rows: $0, outputs: outputs) }
    }

    /// The 95% Wilson score interval for a proportion; (0, 1) with no rows.
    public static func wilson(successes: Int, n: Int) -> (Double, Double) {
        guard n > 0 else { return (0, 1) }
        let z = 1.959963984540054, nn = Double(n), p = Double(successes) / nn
        let centre = p + z * z / (2 * nn)
        let spread = z * ((p * (1 - p) + z * z / (4 * nn)) / nn).squareRoot()
        let denominator = 1 + z * z / nn
        return (max(0, (centre - spread) / denominator), min(1, (centre + spread) / denominator))
    }

    /// The rows only arm a got right, and only arm b got right.
    public static func paired(rows: [EvalRow], a: [String: EvalOutput], b: [String: EvalOutput]) -> (aOnly: Int, bOnly: Int) {
        var aOnly = 0, bOnly = 0
        for row in rows {
            let x = correct(row, a[row.id]), y = correct(row, b[row.id])
            if x && !y { aOnly += 1 }
            if y && !x { bOnly += 1 }
        }
        return (aOnly, bOnly)
    }

    /// The exact (binomial) two-sided McNemar test on the discordant pairs; 1 with none.
    public static func mcnemarExact(bOnly: Int, cOnly: Int) -> Double {
        let n = bOnly + cOnly
        guard n > 0 else { return 1 }
        let k = min(bOnly, cOnly)
        var tail = 0.0, choose = 1.0
        for i in 0...k {
            if i > 0 { choose = choose * Double(n - i + 1) / Double(i) }
            tail += choose
        }
        return min(1, 2 * tail / pow(2, Double(n)))
    }
}
