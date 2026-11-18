import Foundation

/// Lightness class for the map fill: 0 (darkest) to 5 (lightest), relative to the highest POA
/// on screen. Probability is shown by lightness and a printed number, never by hue.
public enum PoaClass {
    public static func classify(poa: Double, maxPoa: Double) -> Int {
        guard poa.isFinite, maxPoa.isFinite, maxPoa > 0, poa > 0 else { return 0 }
        let ratio = poa / maxPoa
        guard ratio < 1 else { return 5 }                      // also keeps an extreme ratio from overflowing Int
        return min(5, Int((ratio * 6).rounded(.down)))
    }

    /// The printed number beside each segment.
    public static func percentLabel(_ poa: Double) -> String {
        guard poa.isFinite, poa > 0 else { return "0%" }
        let pct = (min(poa, 1) * 100).rounded()
        return pct < 1 ? "<1%" : "\(Int(pct))%"
    }
}
