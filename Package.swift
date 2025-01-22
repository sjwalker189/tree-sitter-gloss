// swift-tools-version:5.3
import PackageDescription

let package = Package(
    name: "TreeSitterGloss",
    products: [
        .library(name: "TreeSitterGloss", targets: ["TreeSitterGloss"]),
    ],
    dependencies: [
        .package(url: "https://github.com/ChimeHQ/SwiftTreeSitter", from: "0.8.0"),
    ],
    targets: [
        .target(
            name: "TreeSitterGloss",
            dependencies: [],
            path: ".",
            sources: [
                "src/parser.c",
                // NOTE: if your language has an external scanner, add it here.
            ],
            resources: [
                .copy("queries")
            ],
            publicHeadersPath: "bindings/swift",
            cSettings: [.headerSearchPath("src")]
        ),
        .testTarget(
            name: "TreeSitterGlossTests",
            dependencies: [
                "SwiftTreeSitter",
                "TreeSitterGloss",
            ],
            path: "bindings/swift/TreeSitterGlossTests"
        )
    ],
    cLanguageStandard: .c11
)
