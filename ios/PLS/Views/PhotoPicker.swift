import CoreGraphics
import SwiftUI
import UIKit

/// Takes one photo of something found: the camera, or the photo library where there is no camera (the
/// simulator). The photo is handed on in memory and never saved; the camera does not add it to the library.
struct PhotoPicker: UIViewControllerRepresentable {
    let picked: (CGImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> FoundPhotoController {
        let dismiss = dismiss
        return FoundPhotoController(picked: picked, finish: { dismiss() })
    }

    func updateUIViewController(_ controller: FoundPhotoController, context: Context) {}

    /// The photo upright (its rotation flag applied) and at most 1024 points on its long side: enough for the
    /// model to name an object, and small in memory. Pure drawing, so callable off the main actor.
    nonisolated static func readable(_ image: UIImage, longSide: CGFloat = 1024) -> CGImage? {
        let scale = min(1, longSide / max(image.size.width, image.size.height))
        let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }.cgImage
    }
}

/// Presents the system picker once, as Apple documents for the camera, and is its delegate: it hands on the
/// photo and closes the cover when the picker finishes or is cancelled. While it is up, leaving the app covers the
/// window, so the app switcher's snapshot shows no photo.
final class FoundPhotoController: UIViewController, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    static let shieldId = "photo-shield"
    private let picked: (CGImage) -> Void
    private let finish: () -> Void
    private var presented = false
    private let shield = UIView()

    init(picked: @escaping (CGImage) -> Void, finish: @escaping () -> Void) {
        self.picked = picked
        self.finish = finish
        super.init(nibName: nil, bundle: nil)
        shield.backgroundColor = .black
        shield.accessibilityIdentifier = Self.shieldId
        shield.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        NotificationCenter.default.addObserver(self, selector: #selector(cover), name: UIApplication.willResignActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(uncover), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    @objc private func cover() {
        guard let window = view.window, shield.superview == nil else { return }
        shield.frame = window.bounds
        window.addSubview(shield)
    }

    @objc private func uncover() { shield.removeFromSuperview() }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !presented else { return }
        presented = true
        let picker = UIImagePickerController()
        picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        picker.delegate = self
        present(picker, animated: true)
    }

    func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        let image = (info[.originalImage] as? UIImage).flatMap { PhotoPicker.readable($0) }
        picker.dismiss(animated: true) { [picked, finish] in
            if let image { picked(image) }
            finish()
        }
    }

    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true) { [finish] in finish() }
    }
}
