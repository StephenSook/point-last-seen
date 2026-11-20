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

/// The answer key a person writes for the eval, before any model run: numbered report texts, each
/// with its kind, up to two segment ids (an empty list means no segment is expected) and a feature.
public struct EvalAnswerKey: Codable, Sendable, Equatable {
    public struct Row: Codable, Sendable, Equatable {
        public var n: Int
        public var text: String
        public var kind: ReportKind
        public var segments: [String]
        public var feature: Feature
    }

    public var answerKey: String
    /// "person": the answers were written by a person, not a model.
    public var writtenBy: String
    public var grid: String
    public var rows: [Row]

    /// The rows to score, all in the "fresh" group (written before any model run).
    public var evalRows: [EvalRow] {
        rows.map { EvalRow(id: "n\($0.n)", group: "fresh", text: $0.text, kind: $0.kind, segmentIds: $0.segments, feature: $0.feature) }
    }
}

/// One eval run's result file: the facts that pin it, each arm's outputs and score, and the paired
/// comparison of the on-device arm against the rules-only baseline.
public struct EvalReport: Codable, Sendable, Equatable {
    public struct RunFacts: Codable, Sendable, Equatable {
        public var answerKey: String
        public var answerKeySha256: String
        public var writtenBy: String
        public var grid: String
        public var appVersion: String
        public var build: String
        public var commit: String
        /// SHA-256 of the guided prompt text the model was given.
        public var promptSha256: String
        public var device: String
        public var ranAtMs: Double

        public init(answerKey: String, answerKeySha256: String, writtenBy: String, grid: String, appVersion: String, build: String,
                    commit: String, promptSha256: String, device: String, ranAtMs: Double) {
            self.answerKey = answerKey; self.answerKeySha256 = answerKeySha256; self.writtenBy = writtenBy; self.grid = grid
            self.appVersion = appVersion; self.build = build; self.commit = commit; self.promptSha256 = promptSha256
            self.device = device; self.ranAtMs = ranAtMs
        }
    }

    public struct Arm: Codable, Sendable, Equatable {
        public var arm: String
        public var summary: EvalSummary
        /// Rows with both the kind and the segments right, and its 95% Wilson interval.
        public var right: Int
        public var rightInterval: [Double]
        /// Rows a model actually read (the rest fell back to the rules or gave nothing).
        public var readByModel: Int
        public var outputs: [String: EvalOutput]
    }

    /// The rows only the on-device arm got right, the rows only the rules got right, and the exact
    /// two-sided McNemar p-value on them.
    public struct Paired: Codable, Sendable, Equatable {
        public var onDeviceOnly: Int
        public var rulesOnly: Int
        public var pValue: Double
    }

    public var facts: RunFacts
    public var arms: [Arm]
    public var paired: Paired

    public static func make(rows: [EvalRow], facts: RunFacts, onDevice: [String: EvalOutput], rulesOnly: [String: EvalOutput]) -> EvalReport {
        func arm(_ name: String, _ outputs: [String: EvalOutput]) -> Arm {
            let summary = EvalScorer.score(rows: rows, outputs: outputs)
            let right = rows.filter { EvalScorer.correct($0, outputs[$0.id]) }.count
            let (lo, hi) = EvalScorer.wilson(successes: right, n: rows.count)
            let byModel = rows.filter { row in
                guard let path = outputs[row.id]?.path else { return false }
                return path.hasPrefix("on_device") || path.hasPrefix("cloud")
            }.count
            return Arm(arm: name, summary: summary, right: right, rightInterval: [lo, hi], readByModel: byModel, outputs: outputs)
        }
        let pair = EvalScorer.paired(rows: rows, a: onDevice, b: rulesOnly)
        return EvalReport(facts: facts, arms: [arm("on_device", onDevice), arm("rules_only", rulesOnly)],
                          paired: Paired(onDeviceOnly: pair.aOnly, rulesOnly: pair.bOnly,
                                         pValue: EvalScorer.mcnemarExact(bOnly: pair.aOnly, cOnly: pair.bOnly)))
    }
}
