import CoreGraphics
import Testing
import UIKit
@testable import PLS

/// A photo is drawn upright and no larger than 1024 points on its long side before Apple's model reads it.
@Suite struct PhotoPickerTests {
    static func image(_ width: Int, _ height: Int, orientation: UIImage.Orientation = .up) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let drawn = UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { ctx in
            UIColor.red.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
        return UIImage(cgImage: drawn.cgImage!, scale: 1, orientation: orientation)
    }

    @Test func aLargePhotoIsShrunkToItsLongSide() throws {
        let cg = try #require(PhotoPicker.readable(Self.image(3000, 2000)))
        #expect(cg.width == 1024 && cg.height == 683)
    }

    @Test func aSmallPhotoKeepsItsSize() throws {
        let cg = try #require(PhotoPicker.readable(Self.image(640, 480)))
        #expect(cg.width == 640 && cg.height == 480)
    }

    /// While the picker is up, leaving the app covers the screen, so the app switcher's snapshot shows no photo.
    @MainActor @Test func leavingTheAppCoversThePicker() {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 100, height: 200))
        let controller = FoundPhotoController(picked: { _ in }, finish: {})
        window.rootViewController = controller
        window.makeKeyAndVisible()
        NotificationCenter.default.post(name: UIApplication.willResignActiveNotification, object: nil)
        #expect(window.subviews.contains { $0.accessibilityIdentifier == FoundPhotoController.shieldId })
        NotificationCenter.default.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        #expect(!window.subviews.contains { $0.accessibilityIdentifier == FoundPhotoController.shieldId })
    }

    /// A portrait photo from the camera comes with a rotation flag; the model gets it upright.
    @Test func aRotatedPhotoIsDrawnUpright() throws {
        let cg = try #require(PhotoPicker.readable(Self.image(2000, 1000, orientation: .right)))
        #expect(cg.width == 512 && cg.height == 1024)
    }
}
