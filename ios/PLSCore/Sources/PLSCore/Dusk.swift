import Foundation

/// Whether it is dark enough for night mode: the sun more than 6 degrees below the horizon
/// (after civil dusk and before civil dawn). Standard low-precision solar position formulas,
/// accurate to a small fraction of a degree, which is plenty for a theme switch.
public enum Dusk {
    public static func isAfterCivilDusk(date: Date, lat: Double, lon: Double) -> Bool {
        sunElevationDeg(date: date, lat: lat, lon: lon) < -6
    }

    static func sunElevationDeg(date: Date, lat: Double, lon: Double) -> Double {
        let rad = Double.pi / 180
        let n = date.timeIntervalSince1970 / 86_400 + 2_440_587.5 - 2_451_545.0
        let meanLon = (280.460 + 0.9856474 * n).truncatingRemainder(dividingBy: 360)
        let anomaly = (357.528 + 0.9856003 * n).truncatingRemainder(dividingBy: 360) * rad
        let eclipticLon = (meanLon + 1.915 * sin(anomaly) + 0.020 * sin(2 * anomaly)) * rad
        let obliquity = (23.439 - 0.0000004 * n) * rad
        let rightAscension = atan2(cos(obliquity) * sin(eclipticLon), cos(eclipticLon))
        let declination = asin(sin(obliquity) * sin(eclipticLon))
        let gmstHours = (18.697374558 + 24.06570982441908 * n).truncatingRemainder(dividingBy: 24)
        let hourAngle = (gmstHours * 15 + lon) * rad - rightAscension
        let elevation = asin(sin(lat * rad) * sin(declination) + cos(lat * rad) * cos(declination) * cos(hourAngle))
        return elevation / rad
    }
}
