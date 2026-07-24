# Expo example

Copy these files into an Expo SDK 57 project, install the workspace packages and `@expo/ui`, then
mount `RootPresentationHost` next to your router slot. The example intentionally stays outside the
workspace so package validation does not download a complete Expo application during CI.

It is still type-checked by `npm run typecheck`, through its own `tsconfig.json`, which uses
`moduleResolution: "Bundler"` — the resolution an Expo app actually gets from Metro. That is what
keeps the imports here honest: Metro cannot resolve NodeNext's `./file.js` rewriting, so the
specifiers are extensionless.

Note that `Filters` wraps its React Native tree in `RNHostView` from `@expo/ui`. Content rendered by
`ExpoUiBottomSheetRenderer` mounts inside a native SwiftUI / Jetpack Compose host, so an unwrapped
tree renders on web and comes up empty on device.
