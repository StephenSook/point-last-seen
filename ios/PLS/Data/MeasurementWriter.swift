import FirebaseFirestore
import Foundation
import PLSCore

/// Writes one report's three timings to the device's own measurements document. Like the event
/// write, it is never awaited: offline it waits in Firestore's cache.
@MainActor
protocol MeasurementWriter: AnyObject {
    func write(_ measurement: ReadMeasurement, path: String)
}

@MainActor
final class FirestoreMeasurementWriter: MeasurementWriter {
    func write(_ measurement: ReadMeasurement, path: String) {
        let data: [String: Any] = ["submittedAtMs": measurement.submittedAtMs, "readDoneAtMs": measurement.readDoneAtMs,
                                   "redrawnAtMs": measurement.redrawnAtMs]
        Firestore.firestore().document(path).setData(data) { _ in }
    }
}
