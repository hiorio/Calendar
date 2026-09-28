// TIMEFLOWER_WALLPAPER_INTENT_V1

import AppIntents
import Foundation
import ImageIO
import UIKit
import UniformTypeIdentifiers

@available(iOS 16.0, *)
struct GenerateTimeFlowerWallpaperIntent: AppIntent {
  static var title: LocalizedStringResource = "TimeFlower 잠금화면 배경 만들기"
  static var description = IntentDescription(
    "TimeFlower의 최신 일정과 메모로 잠금화면용 이미지를 만듭니다."
  )
  static var authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed
  static var openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult & ReturnsValue<IntentFile> & ProvidesDialog {
    let result = try await TimeFlowerWallpaperService.generate()
    if result.isFresh {
      return .result(
        value: result.file,
        dialog: "최신 일정으로 잠금화면 이미지를 만들었어요."
      )
    }
    return .result(
      value: result.file,
      dialog: "최신 데이터가 없어 새로고침 안내 이미지를 만들었어요. TimeFlower를 한 번 열어 주세요."
    )
  }
}

@available(iOS 16.0, *)
struct TimeFlowerWallpaperShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: GenerateTimeFlowerWallpaperIntent(),
      phrases: [
        "\(.applicationName) 잠금화면 배경 만들기",
        "\(.applicationName) 배경화면 만들기",
        "\(.applicationName) 일정 배경화면 만들기",
      ],
      shortTitle: "TimeFlower 잠금화면 배경 만들기",
      systemImageName: "calendar.badge.clock"
    )
  }

  static var shortcutTileColor: ShortcutTileColor = .orange
}

@available(iOS 16.0, *)
private enum TimeFlowerWallpaperService {
  private static let appGroupInfoKey = "ExpoWidgetsAppGroupIdentifier"
  private static let widgetsDirectoryName = "ExpoWidgets"
  private static let snapshotFileName = "TimeFlowerWallpaperSnapshot.json"
  private static let outputFileName = "TimeFlowerWallpaper.png"
  private static let regressionMarker = "TIMEFLOWER_WALLPAPER_INTENT_V1"
  private static let regressionMarkerFileName = ".TimeFlowerWallpaperIntentVersion"
  private static let maximumSnapshotBytes: UInt64 = 5 * 1_024 * 1_024
  private static let snapshotReadRetryNanoseconds: UInt64 = 75_000_000

  static func generate(now: Date = Date()) async throws -> GeneratedWallpaper {
    let input = try await loadInput(now: now)
    let data = try await TimeFlowerWallpaperRenderer.render(input: input, now: now)
    let displayFileName = "TimeFlower-잠금화면.png"

    if let directory = input.widgetsDirectory {
      let outputURL = directory.appendingPathComponent(outputFileName, isDirectory: false)
      do {
        try data.write(to: outputURL, options: .atomic)
        persistRegressionMarker(in: directory)
        return GeneratedWallpaper(
          file: temporaryIntentFile(
            fileURL: outputURL,
            filename: displayFileName
          ),
          isFresh: input.refreshMessage == nil
        )
      } catch {
        // Returning in-memory data keeps the automation usable when the shared
        // container is temporarily unable to accept a new output file.
      }
    }

    return GeneratedWallpaper(
      file: temporaryIntentFile(data: data, filename: displayFileName),
      isFresh: input.refreshMessage == nil
    )
  }

  private static func temporaryIntentFile(
    fileURL: URL,
    filename: String
  ) -> IntentFile {
    var file = IntentFile(fileURL: fileURL, filename: filename, type: .png)
    file.removedOnCompletion = true
    return file
  }

  private static func temporaryIntentFile(
    data: Data,
    filename: String
  ) -> IntentFile {
    var file = IntentFile(data: data, filename: filename, type: .png)
    file.removedOnCompletion = true
    return file
  }

  private static func persistRegressionMarker(in directory: URL) {
    let markerURL = directory.appendingPathComponent(
      regressionMarkerFileName,
      isDirectory: false
    )
    try? regressionMarker.write(to: markerURL, atomically: true, encoding: .utf8)
  }

  private static func loadInput(now: Date) async throws -> WallpaperInput {
    let fallbackScreen = WallpaperScreen.deviceFallback
    let fallbackPalette = WallpaperPalette.fallback

    guard
      let groupIdentifier = Bundle.main.object(
        forInfoDictionaryKey: appGroupInfoKey
      ) as? String,
      !groupIdentifier.isEmpty,
      let containerURL = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: groupIdentifier
      )
    else {
      return WallpaperInput.refresh(
        screen: fallbackScreen,
        palette: fallbackPalette,
        widgetsDirectory: nil,
        message: "공유 데이터에 접근할 수 없어요."
      )
    }

    let widgetsDirectory = containerURL.appendingPathComponent(
      widgetsDirectoryName,
      isDirectory: true
    )
    try? FileManager.default.createDirectory(
      at: widgetsDirectory,
      withIntermediateDirectories: true
    )

    let snapshotURL = widgetsDirectory.appendingPathComponent(
      snapshotFileName,
      isDirectory: false
    )
    guard let snapshot = try await loadSnapshotWithRetry(at: snapshotURL) else {
      return WallpaperInput.refresh(
        screen: fallbackScreen,
        palette: fallbackPalette,
        widgetsDirectory: widgetsDirectory,
        message: "저장된 일정이 아직 없어요."
      )
    }

    // A cleared snapshot intentionally has equal generated/expires timestamps.
    // Recognize it before applying freshness rules so a disabled board or
    // account clear never falls through to stale-data handling.
    guard !snapshot.cleared else {
      return WallpaperInput.refresh(
        screen: snapshot.screen,
        palette: snapshot.palette,
        widgetsDirectory: widgetsDirectory,
        message: "잠금화면 보드가 꺼져 있거나 저장된 일정을 지웠어요."
      )
    }

    guard snapshot.expiresAt.value > snapshot.generatedAt.value,
          snapshot.expiresAt.value > now
    else {
      return WallpaperInput.refresh(
        screen: snapshot.screen,
        palette: snapshot.palette,
        widgetsDirectory: widgetsDirectory,
        message: "저장된 일정이 오래되었어요."
      )
    }

    return WallpaperInput(
      snapshot: snapshot,
      screen: snapshot.screen,
      palette: snapshot.palette,
      widgetsDirectory: widgetsDirectory,
      refreshMessage: nil
    )
  }

  private static func loadSnapshotWithRetry(
    at snapshotURL: URL
  ) async throws -> WallpaperSnapshot? {
    if let snapshot = decodeSnapshot(at: snapshotURL) {
      return snapshot
    }

    // The app replaces the JSON atomically. A very short retry bridges the
    // rename window without turning a transient read into a refresh board.
    try await Task.sleep(nanoseconds: snapshotReadRetryNanoseconds)
    return decodeSnapshot(at: snapshotURL)
  }

  private static func decodeSnapshot(at snapshotURL: URL) -> WallpaperSnapshot? {
    guard
      let attributes = try? FileManager.default.attributesOfItem(atPath: snapshotURL.path),
      let fileSize = attributes[.size] as? NSNumber,
      fileSize.uint64Value > 0,
      fileSize.uint64Value <= maximumSnapshotBytes,
      let data = try? Data(contentsOf: snapshotURL, options: .mappedIfSafe),
      let snapshot = try? JSONDecoder().decode(WallpaperSnapshot.self, from: data),
      snapshot.isValid
    else {
      return nil
    }
    return snapshot
  }
}

@available(iOS 16.0, *)
private struct GeneratedWallpaper {
  let file: IntentFile
  let isFresh: Bool
}

private struct WallpaperInput: Sendable {
  let snapshot: WallpaperSnapshot?
  let screen: WallpaperScreen
  let palette: WallpaperPalette
  let widgetsDirectory: URL?
  let refreshMessage: String?

  static func refresh(
    screen: WallpaperScreen,
    palette: WallpaperPalette,
    widgetsDirectory: URL?,
    message: String
  ) -> WallpaperInput {
    WallpaperInput(
      snapshot: nil,
      screen: screen,
      palette: palette,
      widgetsDirectory: widgetsDirectory,
      refreshMessage: message
    )
  }
}

private struct WallpaperSnapshot: Decodable, Sendable {
  let version: Int
  let cleared: Bool
  let generatedAt: WallpaperDate
  let expiresAt: WallpaperDate
  let screen: WallpaperScreen
  let layout: WallpaperLayout
  let weekStart: WallpaperWeekStart
  let backgroundFile: String?
  let palette: WallpaperPalette
  let days: [WallpaperDay]
  let memos: [WallpaperMemo]
  let viewName: String

  var isValid: Bool {
    guard version == 1,
          screen.isValid,
          !viewName.isEmpty,
          viewName.unicodeScalars.count <= 80,
          days.count <= 370,
          memos.count <= 8,
          (backgroundFile?.unicodeScalars.count ?? 0) <= 128,
          palette.isValid,
          days.allSatisfy(\.isValid),
          memos.allSatisfy(\.isValid)
    else {
      return false
    }

    return generatedAt.value.timeIntervalSinceReferenceDate.isFinite
      && expiresAt.value.timeIntervalSinceReferenceDate.isFinite
  }
}

private enum WallpaperLayout: String, Decodable, Sendable {
  case agenda
  case month
}

private enum WallpaperWeekStart: String, Decodable, Sendable {
  case sunday
  case monday

  var zeroBasedIndex: Int {
    switch self {
    case .sunday:
      return 0
    case .monday:
      return 1
    }
  }
}

private struct WallpaperScreen: Decodable, Sendable {
  let width: Double
  let height: Double
  let scale: Double

  var pointSize: CGSize {
    CGSize(width: CGFloat(width), height: CGFloat(height))
  }

  var isValid: Bool {
    guard width >= 320,
          width <= 500,
          height >= 568,
          height <= 1_200,
          scale >= 1,
          scale <= 4,
          height / width >= 1.5,
          height / width <= 3
    else {
      return false
    }

    return width * scale * height * scale <= 8_000_000
  }

  static var deviceFallback: WallpaperScreen {
    WallpaperScreen(width: 390, height: 844, scale: 3)
  }
}

private struct WallpaperPalette: Decodable, Sendable {
  let background: String
  let card: String?
  let text: String
  let textSecondary: String
  let accent: String
  let onAccent: String?

  static let fallback = WallpaperPalette(
    background: "#20242B",
    card: "#1B1D22",
    text: "#FFFFFF",
    textSecondary: "#C8CBD0",
    accent: "#E2673F",
    onAccent: "#FFFFFF"
  )

  var isValid: Bool {
    let required = [background, text, textSecondary, accent]
    let optional = [card, onAccent].compactMap { $0 }
    return (required + optional).allSatisfy {
      !$0.isEmpty && $0.unicodeScalars.count <= 32
    }
  }
}

private struct WallpaperDay: Decodable, Sendable {
  let key: String
  let eventCount: Int
  let events: [WallpaperEvent]

  var isValid: Bool {
    !key.isEmpty
      && key.unicodeScalars.count <= 32
      && events.count <= 12
      && eventCount >= events.count
      && eventCount <= 10_000
      && events.allSatisfy(\.isValid)
  }
}

private struct WallpaperEvent: Decodable, Sendable {
  let title: String
  let timeLabel: String
  let calendarName: String?
  let color: String
  let isAllDay: Bool

  var isValid: Bool {
    !title.isEmpty
      && title.unicodeScalars.count <= 120
      && timeLabel.unicodeScalars.count <= 40
      && (calendarName?.unicodeScalars.count ?? 0) <= 80
      && !color.isEmpty
      && color.unicodeScalars.count <= 32
  }
}

private struct WallpaperMemo: Decodable, Sendable {
  let content: String
  let color: String?

  var isValid: Bool {
    !content.isEmpty
      && content.unicodeScalars.count <= 200
      && (color?.unicodeScalars.count ?? 0) <= 32
  }
}

private struct WallpaperDate: Decodable, Sendable {
  let value: Date

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()

    if let timestamp = try? container.decode(Double.self) {
      let seconds = timestamp > 10_000_000_000 ? timestamp / 1_000 : timestamp
      value = Date(timeIntervalSince1970: seconds)
      return
    }

    let raw = try container.decode(String.self)
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = fractional.date(from: raw) {
      value = date
      return
    }

    let standard = ISO8601DateFormatter()
    standard.formatOptions = [.withInternetDateTime]
    if let date = standard.date(from: raw) {
      value = date
      return
    }

    throw DecodingError.dataCorruptedError(
      in: container,
      debugDescription: "Expected an ISO-8601 date or Unix timestamp"
    )
  }
}

private enum TimeFlowerWallpaperRenderError: LocalizedError {
  case encodingFailed

  var errorDescription: String? {
    switch self {
    case .encodingFailed:
      return "잠금화면 이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요."
    }
  }
}

@MainActor
private enum TimeFlowerWallpaperRenderer {
  private static let koreanLocale = Locale(identifier: "ko_KR")
  private static let maximumBackgroundBytes = 25 * 1_024 * 1_024

  static func render(input: WallpaperInput, now: Date) throws -> Data {
    let format = UIGraphicsImageRendererFormat()
    format.scale = CGFloat(input.screen.scale)
    format.opaque = true

    let renderer = UIGraphicsImageRenderer(size: input.screen.pointSize, format: format)
    let image = renderer.image { rendererContext in
      let bounds = CGRect(origin: .zero, size: input.screen.pointSize)
      drawBackground(
        in: bounds,
        context: rendererContext.cgContext,
        input: input
      )

      if let snapshot = input.snapshot {
        switch snapshot.layout {
        case .agenda:
          drawAgenda(snapshot: snapshot, in: bounds, now: now)
        case .month:
          drawMonth(snapshot: snapshot, in: bounds, now: now)
        }
      } else {
        drawRefreshBoard(
          message: input.refreshMessage ?? "TimeFlower를 열어 새로고침해 주세요.",
          palette: input.palette,
          in: bounds
        )
      }
    }

    guard let data = image.pngData() else {
      throw TimeFlowerWallpaperRenderError.encodingFailed
    }
    return data
  }

  private static func drawBackground(
    in bounds: CGRect,
    context: CGContext,
    input: WallpaperInput
  ) {
    if let snapshot = input.snapshot,
       let background = loadBackgroundImage(
         named: snapshot.backgroundFile,
         from: input.widgetsDirectory,
         screen: input.screen
       ) {
      drawAspectFill(background, in: bounds)
    } else {
      let base = color(input.palette.background, fallback: UIColor(red: 0.12, green: 0.14, blue: 0.17, alpha: 1))
      let accent = color(input.palette.accent, fallback: UIColor(red: 0.89, green: 0.40, blue: 0.25, alpha: 1))
      let lightBackground = isLightBackground(base)
      let colors = [
        blend(base, accent, amount: lightBackground ? 0.08 : 0.24).cgColor,
        blend(base, .black, amount: lightBackground ? 0.06 : 0.34).cgColor,
      ] as CFArray
      if let gradient = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: colors,
        locations: [0, 1]
      ) {
        context.drawLinearGradient(
          gradient,
          start: CGPoint(x: bounds.midX, y: bounds.minY),
          end: CGPoint(x: bounds.midX, y: bounds.maxY),
          options: []
        )
      } else {
        base.setFill()
        context.fill(bounds)
      }
    }

    let lightBackground = isLightBackground(
      color(input.palette.background, fallback: .black)
    ) && input.snapshot?.backgroundFile == nil
    let shadeColors = [
      UIColor.black.withAlphaComponent(lightBackground ? 0.02 : 0.05).cgColor,
      UIColor.black.withAlphaComponent(lightBackground ? 0.08 : 0.34).cgColor,
    ] as CFArray
    if let shade = CGGradient(
      colorsSpace: CGColorSpaceCreateDeviceRGB(),
      colors: shadeColors,
      locations: [0, 1]
    ) {
      context.drawLinearGradient(
        shade,
        start: CGPoint(x: bounds.midX, y: bounds.minY),
        end: CGPoint(x: bounds.midX, y: bounds.maxY),
        options: []
      )
    }
  }

  private static func loadBackgroundImage(
    named rawName: String?,
    from directory: URL?,
    screen: WallpaperScreen
  ) -> UIImage? {
    guard let rawName,
          !rawName.isEmpty,
          rawName == (rawName as NSString).lastPathComponent,
          let directory
    else {
      return nil
    }

    let root = directory.resolvingSymlinksInPath().standardizedFileURL
    let url = directory
      .appendingPathComponent(rawName, isDirectory: false)
      .resolvingSymlinksInPath()
      .standardizedFileURL
    guard url.deletingLastPathComponent() == root,
          let values = try? url.resourceValues(
            forKeys: [.isRegularFileKey, .fileSizeKey]
          ),
          values.isRegularFile == true,
          let fileSize = values.fileSize,
          fileSize > 0,
          fileSize <= maximumBackgroundBytes,
          let source = CGImageSourceCreateWithURL(url as CFURL, nil)
    else {
      return nil
    }

    let requestedPixelSize = max(screen.width, screen.height) * screen.scale
    let maximumPixelSize = min(4_096, Int(ceil(requestedPixelSize)))
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: maximumPixelSize,
      kCGImageSourceShouldCacheImmediately: true,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(
      source,
      0,
      options as CFDictionary
    ) else {
      return nil
    }
    return UIImage(cgImage: image)
  }

  private static func drawAspectFill(_ image: UIImage, in bounds: CGRect) {
    guard image.size.width > 0, image.size.height > 0 else { return }
    let fillScale = max(
      bounds.width / image.size.width,
      bounds.height / image.size.height
    )
    let size = CGSize(
      width: image.size.width * fillScale,
      height: image.size.height * fillScale
    )
    image.draw(
      in: CGRect(
        x: bounds.midX - size.width / 2,
        y: bounds.midY - size.height / 2,
        width: size.width,
        height: size.height
      )
    )
  }

  private static func drawAgenda(
    snapshot: WallpaperSnapshot,
    in bounds: CGRect,
    now: Date
  ) {
    let metrics = LayoutMetrics(bounds: bounds)
    let daysByKey = dictionaryByDay(snapshot.days)
    let weekDates = datesInCurrentWeek(now: now, weekStart: snapshot.weekStart)
    let todayKey = dayKey(now)
    let today = daysByKey[todayKey]
    let text = color(snapshot.palette.text, fallback: .white)
    let secondary = color(snapshot.palette.textSecondary, fallback: UIColor.white.withAlphaComponent(0.7))
    let accent = color(snapshot.palette.accent, fallback: UIColor(red: 0.89, green: 0.40, blue: 0.25, alpha: 1))
    let card = color(snapshot.palette.card, fallback: UIColor.black)
    let onAccent = color(snapshot.palette.onAccent, fallback: UIColor.white)

    let weekRect = CGRect(
      x: metrics.margin,
      y: metrics.contentTop,
      width: bounds.width - metrics.margin * 2,
      height: metrics.weekCardHeight
    )
    drawCard(weekRect, color: card)
    drawWeekStrip(
      dates: weekDates,
      daysByKey: daysByKey,
      todayKey: todayKey,
      text: text,
      secondary: secondary,
      accent: accent,
      onAccent: onAccent,
      in: weekRect,
      scale: metrics.unit
    )

    let listY = weekRect.maxY + metrics.gap
    let listRect = CGRect(
      x: metrics.margin,
      y: listY,
      width: bounds.width - metrics.margin * 2,
      height: max(120, bounds.height - listY - metrics.bottomMargin)
    )
    drawCard(listRect, color: card)
    drawAgendaList(
      day: today,
      memos: snapshot.memos,
      now: now,
      text: text,
      secondary: secondary,
      accent: accent,
      onAccent: onAccent,
      in: listRect,
      scale: metrics.unit
    )
  }

  private static func drawMonth(
    snapshot: WallpaperSnapshot,
    in bounds: CGRect,
    now: Date
  ) {
    let metrics = LayoutMetrics(bounds: bounds)
    let text = color(snapshot.palette.text, fallback: .white)
    let secondary = color(snapshot.palette.textSecondary, fallback: UIColor.white.withAlphaComponent(0.7))
    let accent = color(snapshot.palette.accent, fallback: UIColor(red: 0.89, green: 0.40, blue: 0.25, alpha: 1))
    let card = color(snapshot.palette.card, fallback: UIColor.black)
    let onAccent = color(snapshot.palette.onAccent, fallback: UIColor.white)
    let daysByKey = dictionaryByDay(snapshot.days)
    let today = daysByKey[dayKey(now)]
    let monthY = min(265 * metrics.unit, bounds.height * 0.33)
    let availableHeight = bounds.height - monthY - metrics.bottomMargin - metrics.gap
    let monthHeight = min(420 * metrics.unit, max(220 * metrics.unit, availableHeight * 0.70))
    let monthRect = CGRect(
      x: metrics.margin,
      y: monthY,
      width: bounds.width - metrics.margin * 2,
      height: monthHeight
    )
    drawCard(monthRect, color: card)
    drawMonthGrid(
      now: now,
      weekStart: snapshot.weekStart,
      daysByKey: daysByKey,
      text: text,
      secondary: secondary,
      accent: accent,
      onAccent: onAccent,
      in: monthRect,
      scale: metrics.unit
    )

    let todayRect = CGRect(
      x: metrics.margin,
      y: monthRect.maxY + metrics.gap,
      width: bounds.width - metrics.margin * 2,
      height: max(90 * metrics.unit, bounds.height - monthRect.maxY - metrics.gap - metrics.bottomMargin)
    )
    drawCard(todayRect, color: card)
    drawAgendaList(
      day: today,
      memos: [],
      now: now,
      text: text,
      secondary: secondary,
      accent: accent,
      onAccent: onAccent,
      in: todayRect,
      scale: metrics.unit
    )
  }

  private static func drawRefreshBoard(
    message: String,
    palette: WallpaperPalette,
    in bounds: CGRect
  ) {
    let metrics = LayoutMetrics(bounds: bounds)
    let text = color(palette.text, fallback: .white)
    let secondary = color(
      palette.textSecondary,
      fallback: UIColor.white.withAlphaComponent(0.72)
    )
    let accent = color(
      palette.accent,
      fallback: UIColor(red: 0.89, green: 0.40, blue: 0.25, alpha: 1)
    )
    let cardColor = color(palette.card, fallback: UIColor.black)
    let cardHeight = min(230 * metrics.unit, bounds.height - metrics.contentTop - metrics.bottomMargin)
    let card = CGRect(
      x: metrics.margin,
      y: metrics.contentTop,
      width: bounds.width - metrics.margin * 2,
      height: max(170, cardHeight)
    )
    drawCard(card, color: cardColor)

    let symbolSize = 44 * metrics.unit
    let symbolRect = CGRect(
      x: card.midX - symbolSize / 2,
      y: card.minY + 24 * metrics.unit,
      width: symbolSize,
      height: symbolSize
    )
    accent.withAlphaComponent(0.18).setFill()
    UIBezierPath(ovalIn: symbolRect).fill()
    if let symbol = UIImage(systemName: "arrow.clockwise")?.withTintColor(
      accent,
      renderingMode: .alwaysOriginal
    ) {
      let inset = symbolRect.insetBy(dx: 11 * metrics.unit, dy: 11 * metrics.unit)
      symbol.draw(in: inset)
    }

    drawText(
      "최신 일정이 필요해요",
      in: CGRect(
        x: card.minX + 20 * metrics.unit,
        y: symbolRect.maxY + 12 * metrics.unit,
        width: card.width - 40 * metrics.unit,
        height: 27 * metrics.unit
      ),
      font: .systemFont(ofSize: 20 * metrics.unit, weight: .bold),
      color: text,
      alignment: .center
    )
    drawText(
      message,
      in: CGRect(
        x: card.minX + 24 * metrics.unit,
        y: symbolRect.maxY + 45 * metrics.unit,
        width: card.width - 48 * metrics.unit,
        height: 22 * metrics.unit
      ),
      font: .systemFont(ofSize: 13 * metrics.unit, weight: .medium),
      color: secondary,
      alignment: .center
    )
    drawText(
      "TimeFlower를 연 다음 자동화를 다시 실행해 주세요.",
      in: CGRect(
        x: card.minX + 20 * metrics.unit,
        y: card.maxY - 40 * metrics.unit,
        width: card.width - 40 * metrics.unit,
        height: 18 * metrics.unit
      ),
      font: .systemFont(ofSize: 11 * metrics.unit, weight: .regular),
      color: secondary.withAlphaComponent(0.84),
      alignment: .center
    )
  }

  private static func drawWeekStrip(
    dates: [Date],
    daysByKey: [String: WallpaperDay],
    todayKey: String,
    text: UIColor,
    secondary: UIColor,
    accent: UIColor,
    onAccent: UIColor,
    in rect: CGRect,
    scale: CGFloat
  ) {
    let inset = 12 * scale
    let top = rect.minY + 10 * scale
    let columnWidth = (rect.width - inset * 2) / 7
    let weekdayFormatter = DateFormatter()
    weekdayFormatter.locale = koreanLocale
    weekdayFormatter.dateFormat = "E"

    for (index, date) in dates.enumerated() {
      let key = dayKey(date)
      let isToday = key == todayKey
      let x = rect.minX + inset + CGFloat(index) * columnWidth
      let weekday = weekdayFormatter.string(from: date)
      drawText(
        weekday,
        in: CGRect(x: x, y: top, width: columnWidth, height: 14 * scale),
        font: .systemFont(ofSize: 9 * scale, weight: .medium),
        color: secondary,
        alignment: .center
      )

      let dayNumber = String(calendar().component(.day, from: date))
      let numberRect = CGRect(
        x: x + (columnWidth - 25 * scale) / 2,
        y: top + 17 * scale,
        width: 25 * scale,
        height: 25 * scale
      )
      if isToday {
        accent.setFill()
        UIBezierPath(ovalIn: numberRect).fill()
      }
      drawText(
        dayNumber,
        in: numberRect.offsetBy(dx: 0, dy: 3 * scale),
        font: .systemFont(ofSize: 13 * scale, weight: .bold),
        color: isToday ? onAccent : text,
        alignment: .center
      )

      let events = Array((daysByKey[key]?.events ?? []).prefix(2))
      for (eventIndex, event) in events.enumerated() {
        let chipRect = CGRect(
          x: x + 2 * scale,
          y: top + 48 * scale + CGFloat(eventIndex) * 15 * scale,
          width: columnWidth - 4 * scale,
          height: 12 * scale
        )
        let eventColor = color(event.color, fallback: accent)
        eventColor.withAlphaComponent(0.33).setFill()
        UIBezierPath(roundedRect: chipRect, cornerRadius: 3 * scale).fill()
        eventColor.setFill()
        UIBezierPath(
          roundedRect: CGRect(
            x: chipRect.minX,
            y: chipRect.minY,
            width: 2.5 * scale,
            height: chipRect.height
          ),
          cornerRadius: 1.25 * scale
        ).fill()
        drawText(
          event.title,
          in: chipRect.insetBy(dx: 4 * scale, dy: 1.5 * scale),
          font: .systemFont(ofSize: 6.5 * scale, weight: .semibold),
          color: text.withAlphaComponent(0.9)
        )
      }

      let extra = max(0, (daysByKey[key]?.eventCount ?? 0) - events.count)
      if extra > 0 {
        drawText(
          "+\(extra)",
          in: CGRect(
            x: x,
            y: rect.maxY - 16 * scale,
            width: columnWidth,
            height: 10 * scale
          ),
          font: .systemFont(ofSize: 7 * scale, weight: .medium),
          color: secondary,
          alignment: .center
        )
      }
    }
  }

  private static func drawAgendaList(
    day: WallpaperDay?,
    memos: [WallpaperMemo],
    now: Date,
    text: UIColor,
    secondary: UIColor,
    accent: UIColor,
    onAccent: UIColor,
    in rect: CGRect,
    scale: CGFloat
  ) {
    let inset = 18 * scale
    let dateFormatter = DateFormatter()
    dateFormatter.locale = koreanLocale
    dateFormatter.dateFormat = "M월 d일 EEEE"
    let events = day?.events ?? []
    let count = (day?.eventCount ?? 0) + memos.count

    drawText(
      dateFormatter.string(from: now),
      in: CGRect(
        x: rect.minX + inset,
        y: rect.minY + 15 * scale,
        width: rect.width - inset * 2 - 44 * scale,
        height: 25 * scale
      ),
      font: .systemFont(ofSize: 18 * scale, weight: .bold),
      color: text
    )
    drawCountPill(
      count: count,
      accent: accent,
      onAccent: onAccent,
      in: CGRect(
        x: rect.maxX - inset - 33 * scale,
        y: rect.minY + 14 * scale,
        width: 33 * scale,
        height: 23 * scale
      ),
      scale: scale
    )
    var y = rect.minY + 49 * scale
    let rowHeight = 31 * scale
    let availableRows = max(1, Int(floor((rect.maxY - y - 14 * scale) / rowHeight)))
    let visibleEvents = Array(events.prefix(availableRows))
    for event in visibleEvents {
      drawAgendaEventRow(
        event,
        y: y,
        rect: rect,
        inset: inset,
        text: text,
        secondary: secondary,
        accent: accent,
        scale: scale
      )
      y += rowHeight
    }

    let remainingRows = max(0, availableRows - visibleEvents.count)
    if remainingRows > 0, !memos.isEmpty {
      secondary.withAlphaComponent(0.22).setStroke()
      let divider = UIBezierPath()
      divider.move(to: CGPoint(x: rect.minX + inset, y: y + 1 * scale))
      divider.addLine(to: CGPoint(x: rect.maxX - inset, y: y + 1 * scale))
      divider.lineWidth = 0.7 * scale
      divider.stroke()
      y += 7 * scale

      let memoRows = max(0, Int(floor((rect.maxY - y - 10 * scale) / rowHeight)))
      for memo in memos.prefix(memoRows) {
        drawMemoRow(
          memo,
          y: y,
          rect: rect,
          inset: inset,
          text: text,
          secondary: secondary,
          accent: accent,
          scale: scale
        )
        y += rowHeight
      }
    }

    if events.isEmpty, memos.isEmpty {
      drawText(
        "오늘 예정된 일정이 없어요.",
        in: CGRect(
          x: rect.minX + inset,
          y: rect.midY - 10 * scale,
          width: rect.width - inset * 2,
          height: 20 * scale
        ),
        font: .systemFont(ofSize: 13 * scale, weight: .medium),
        color: secondary,
        alignment: .center
      )
    }
  }

  private static func drawAgendaEventRow(
    _ event: WallpaperEvent,
    y: CGFloat,
    rect: CGRect,
    inset: CGFloat,
    text: UIColor,
    secondary: UIColor,
    accent: UIColor,
    scale: CGFloat
  ) {
    let eventColor = color(event.color, fallback: accent)
    let timeWidth = 58 * scale
    let trailingWidth = 88 * scale
    let time = event.isAllDay ? "종일" : event.timeLabel
    drawText(
      time,
      in: CGRect(
        x: rect.minX + inset,
        y: y + 5 * scale,
        width: timeWidth,
        height: 18 * scale
      ),
      font: .monospacedDigitSystemFont(ofSize: 11 * scale, weight: .medium),
      color: secondary,
      alignment: .right
    )
    eventColor.setFill()
    UIBezierPath(
      roundedRect: CGRect(
        x: rect.minX + inset + timeWidth + 10 * scale,
        y: y + 5 * scale,
        width: 4 * scale,
        height: 20 * scale
      ),
      cornerRadius: 2 * scale
    ).fill()
    let titleX = rect.minX + inset + timeWidth + 21 * scale
    drawText(
      event.title,
      in: CGRect(
        x: titleX,
        y: y + 4 * scale,
        width: max(20, rect.maxX - inset - trailingWidth - titleX),
        height: 20 * scale
      ),
      font: .systemFont(ofSize: 13 * scale, weight: .semibold),
      color: text
    )
    let trailing = event.isAllDay ? "하루 종일" : event.timeLabel
    drawText(
      trailing,
      in: CGRect(
        x: rect.maxX - inset - trailingWidth,
        y: y + 5 * scale,
        width: trailingWidth,
        height: 18 * scale
      ),
      font: .monospacedDigitSystemFont(ofSize: 9.5 * scale, weight: .medium),
      color: eventColor,
      alignment: .right
    )
  }

  private static func drawMemoRow(
    _ memo: WallpaperMemo,
    y: CGFloat,
    rect: CGRect,
    inset: CGFloat,
    text: UIColor,
    secondary: UIColor,
    accent: UIColor,
    scale: CGFloat
  ) {
    let memoColor = color(memo.color, fallback: accent)
    let circle = CGRect(
      x: rect.minX + inset + 58 * scale,
      y: y + 8 * scale,
      width: 12 * scale,
      height: 12 * scale
    )
    memoColor.setStroke()
    let path = UIBezierPath(ovalIn: circle)
    path.lineWidth = 1.8 * scale
    path.stroke()
    drawText(
      memo.content,
      in: CGRect(
        x: circle.maxX + 9 * scale,
        y: y + 4 * scale,
        width: rect.maxX - inset - circle.maxX - 9 * scale,
        height: 20 * scale
      ),
      font: .systemFont(ofSize: 13 * scale, weight: .medium),
      color: text.withAlphaComponent(0.94)
    )
    _ = secondary
  }

  private static func drawMonthGrid(
    now: Date,
    weekStart: WallpaperWeekStart,
    daysByKey: [String: WallpaperDay],
    text: UIColor,
    secondary: UIColor,
    accent: UIColor,
    onAccent: UIColor,
    in rect: CGRect,
    scale: CGFloat
  ) {
    let calendar = calendar()
    let components = calendar.dateComponents([.year, .month], from: now)
    guard let firstDay = calendar.date(from: components) else {
      return
    }

    let inset = 13 * scale
    let titleFormatter = DateFormatter()
    titleFormatter.locale = koreanLocale
    titleFormatter.dateFormat = "yyyy년 M월"
    drawText(
      titleFormatter.string(from: now),
      in: CGRect(
        x: rect.minX + inset,
        y: rect.minY + 12 * scale,
        width: rect.width * 0.55,
        height: 23 * scale
      ),
      font: .systemFont(ofSize: 17 * scale, weight: .bold),
      color: text
    )
    let gridTop = rect.minY + 43 * scale
    let gridBottom = rect.maxY - 10 * scale
    let columnWidth = (rect.width - inset * 2) / 7
    let weekdayHeight = 17 * scale
    let rowHeight = (gridBottom - gridTop - weekdayHeight) / 6
    let symbols = reorderedWeekdaySymbols(weekStart: weekStart)
    for index in 0 ..< 7 {
      drawText(
        symbols[index],
        in: CGRect(
          x: rect.minX + inset + CGFloat(index) * columnWidth,
          y: gridTop,
          width: columnWidth,
          height: weekdayHeight
        ),
        font: .systemFont(ofSize: 8 * scale, weight: .semibold),
        color: secondary,
        alignment: .center
      )
    }

    let firstWeekday = normalizedFirstWeekday(weekStart)
    let offset = (calendar.component(.weekday, from: firstDay) - firstWeekday + 7) % 7
    guard let gridStart = calendar.date(
      byAdding: .day,
      value: -offset,
      to: firstDay
    ) else {
      return
    }
    let todayKey = dayKey(now)

    for position in 0 ..< 42 {
      guard let date = calendar.date(byAdding: .day, value: position, to: gridStart) else {
        continue
      }
      let row = position / 7
      let column = position % 7
      let cell = CGRect(
        x: rect.minX + inset + CGFloat(column) * columnWidth,
        y: gridTop + weekdayHeight + CGFloat(row) * rowHeight,
        width: columnWidth,
        height: rowHeight
      )
      let key = dayKey(date)
      let isToday = key == todayKey
      let dateComponents = calendar.dateComponents([.year, .month, .day], from: date)
      let isInCurrentMonth = dateComponents.year == components.year
        && dateComponents.month == components.month
      let numberRect = CGRect(
        x: cell.midX - 11 * scale,
        y: cell.minY + 2 * scale,
        width: 22 * scale,
        height: 19 * scale
      )
      if isToday {
        accent.setFill()
        UIBezierPath(ovalIn: numberRect.insetBy(dx: 1 * scale, dy: 0)).fill()
      }
      drawText(
        String(dateComponents.day ?? 0),
        in: numberRect.offsetBy(dx: 0, dy: 2 * scale),
        font: .systemFont(ofSize: 10 * scale, weight: .bold),
        color: isToday
          ? onAccent
          : text.withAlphaComponent(isInCurrentMonth ? 1 : 0.35),
        alignment: .center
      )

      let events = Array((daysByKey[key]?.events ?? []).prefix(rowHeight >= 35 * scale ? 2 : 1))
      let chipHeight = min(11 * scale, max(3 * scale, (rowHeight - 24 * scale) / 2))
      for (eventIndex, event) in events.enumerated() {
        let chip = CGRect(
          x: cell.minX + 2 * scale,
          y: numberRect.maxY + 2 * scale + CGFloat(eventIndex) * (chipHeight + 2 * scale),
          width: cell.width - 4 * scale,
          height: chipHeight
        )
        let eventColor = color(event.color, fallback: accent)
        eventColor.withAlphaComponent(isInCurrentMonth ? 0.32 : 0.18).setFill()
        UIBezierPath(roundedRect: chip, cornerRadius: 2.5 * scale).fill()
        drawText(
          event.title,
          in: chip.insetBy(dx: 3 * scale, dy: 1 * scale),
          font: .systemFont(ofSize: 6 * scale, weight: .semibold),
          color: text.withAlphaComponent(isInCurrentMonth ? 0.92 : 0.5)
        )
      }
    }
  }

  private static func drawCountPill(
    count: Int,
    accent: UIColor,
    onAccent: UIColor,
    in rect: CGRect,
    scale: CGFloat
  ) {
    accent.setFill()
    UIBezierPath(roundedRect: rect, cornerRadius: rect.height / 2).fill()
    drawText(
      String(count),
      in: rect.offsetBy(dx: 0, dy: 3 * scale),
      font: .monospacedDigitSystemFont(ofSize: 11 * scale, weight: .bold),
      color: onAccent,
      alignment: .center
    )
  }

  private static func drawCard(_ rect: CGRect, color: UIColor) {
    color.withAlphaComponent(0.78).setFill()
    let path = UIBezierPath(roundedRect: rect, cornerRadius: min(22, rect.width * 0.05))
    path.fill()
    UIColor.white.withAlphaComponent(0.07).setStroke()
    path.lineWidth = 0.7
    path.stroke()
  }

  private static func drawText(
    _ value: String,
    in rect: CGRect,
    font: UIFont,
    color: UIColor,
    alignment: NSTextAlignment = .left
  ) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = alignment
    paragraph.lineBreakMode = .byTruncatingTail
    (value as NSString).draw(
      in: rect,
      withAttributes: [
        .font: font,
        .foregroundColor: color,
        .paragraphStyle: paragraph,
      ]
    )
  }

  private static func dictionaryByDay(_ days: [WallpaperDay]) -> [String: WallpaperDay] {
    days.reduce(into: [:]) { result, day in
      if result[day.key] == nil {
        result[day.key] = day
      }
    }
  }

  private static func datesInCurrentWeek(
    now: Date,
    weekStart: WallpaperWeekStart
  ) -> [Date] {
    let calendar = calendar()
    let startOfToday = calendar.startOfDay(for: now)
    let firstWeekday = normalizedFirstWeekday(weekStart)
    let weekday = calendar.component(.weekday, from: startOfToday)
    let offset = (weekday - firstWeekday + 7) % 7
    let first = calendar.date(byAdding: .day, value: -offset, to: startOfToday) ?? startOfToday
    return (0 ..< 7).compactMap {
      calendar.date(byAdding: .day, value: $0, to: first)
    }
  }

  private static func reorderedWeekdaySymbols(
    weekStart: WallpaperWeekStart
  ) -> [String] {
    let symbols = ["일", "월", "화", "수", "목", "금", "토"]
    let offset = weekStart.zeroBasedIndex
    return Array(symbols[offset...]) + Array(symbols[..<offset])
  }

  private static func normalizedFirstWeekday(_ weekStart: WallpaperWeekStart) -> Int {
    weekStart.zeroBasedIndex + 1
  }

  private static func calendar() -> Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.locale = koreanLocale
    calendar.timeZone = .autoupdatingCurrent
    return calendar
  }

  private static func dayKey(_ date: Date) -> String {
    let components = calendar().dateComponents([.year, .month, .day], from: date)
    return String(
      format: "%04d-%02d-%02d",
      components.year ?? 0,
      components.month ?? 0,
      components.day ?? 0
    )
  }

  private static func color(_ raw: String?, fallback: UIColor) -> UIColor {
    guard let raw else { return fallback }
    var value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if value.hasPrefix("#") {
      value.removeFirst()
    }
    guard value.count == 6 || value.count == 8,
          let number = UInt64(value, radix: 16)
    else {
      return fallback
    }

    if value.count == 6 {
      return UIColor(
        red: CGFloat((number >> 16) & 0xff) / 255,
        green: CGFloat((number >> 8) & 0xff) / 255,
        blue: CGFloat(number & 0xff) / 255,
        alpha: 1
      )
    }

    return UIColor(
      red: CGFloat((number >> 24) & 0xff) / 255,
      green: CGFloat((number >> 16) & 0xff) / 255,
      blue: CGFloat((number >> 8) & 0xff) / 255,
      alpha: CGFloat(number & 0xff) / 255
    )
  }

  private static func isLightBackground(_ color: UIColor) -> Bool {
    var red: CGFloat = 0
    var green: CGFloat = 0
    var blue: CGFloat = 0
    var alpha: CGFloat = 0
    guard color.getRed(&red, green: &green, blue: &blue, alpha: &alpha) else {
      return false
    }
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue > 0.7
  }

  private static func blend(_ first: UIColor, _ second: UIColor, amount: CGFloat) -> UIColor {
    var r1: CGFloat = 0
    var g1: CGFloat = 0
    var b1: CGFloat = 0
    var a1: CGFloat = 0
    var r2: CGFloat = 0
    var g2: CGFloat = 0
    var b2: CGFloat = 0
    var a2: CGFloat = 0
    guard first.getRed(&r1, green: &g1, blue: &b1, alpha: &a1),
          second.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
    else {
      return first
    }
    let value = min(1, max(0, amount))
    return UIColor(
      red: r1 + (r2 - r1) * value,
      green: g1 + (g2 - g1) * value,
      blue: b1 + (b2 - b1) * value,
      alpha: a1 + (a2 - a1) * value
    )
  }
}

private struct LayoutMetrics {
  let unit: CGFloat
  let margin: CGFloat
  let gap: CGFloat
  let bottomMargin: CGFloat
  let contentTop: CGFloat
  let weekCardHeight: CGFloat

  init(bounds: CGRect) {
    unit = min(1.35, max(0.78, bounds.width / 390))
    margin = 16 * unit
    gap = 12 * unit
    bottomMargin = 34 * unit
    contentTop = min(310 * unit, bounds.height * 0.43)
    weekCardHeight = 102 * unit
  }
}
