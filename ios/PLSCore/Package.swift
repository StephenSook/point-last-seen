// swift-tools-version: 6.0
import PackageDescription

// PLSCore is the Swift twin of the TypeScript search engine. It holds no Apple-only
// framework and no Firebase, so the same tests run on macOS and on Linux in CI.
let package = Package(
    name: "PLSCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "PLSCore", targets: ["PLSCore"])
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-crypto.git", "4.0.0"..<"6.0.0")
    ],
    targets: [
        .target(
            name: "PLSCore",
            dependencies: [.product(name: "Crypto", package: "swift-crypto")]
        ),
        .testTarget(
            name: "PLSCoreTests",
            dependencies: ["PLSCore"]
        )
    ]
)
