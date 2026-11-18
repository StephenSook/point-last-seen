import Foundation

/// Lightness class for the map fill: 0 (darkest) to 5 (lightest), relative to the highest POA
/// on screen. Probability is shown by lightness and a printed number, never by hue.
public enum PoaClass {
    public static func classify(poa: Double, maxPoa: Double) -> Int {
        guard poa.isFinite, maxPoa.isFinite, maxPoa > 0, poa > 0 else { return 0 }
        return min(5, Int((poa / maxPoa * 6).rounded(.down)))
    }

    /// The printed number beside each segment.
    public static func percentLabel(_ poa: Double) -> String {
        guard poa.isFinite, poa > 0 else { return "0%" }
        let pct = (poa * 100).rounded()
        return pct < 1 ? "<1%" : "\(Int(pct))%"
    }
}
