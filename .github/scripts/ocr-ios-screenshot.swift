import AppKit
import Foundation
import Vision

struct RecognizedLine: Codable {
  let text: String
  let confidence: Float
  let x: Double
  let y: Double
  let width: Double
  let height: Double
}

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("\(message)\n".utf8))
  exit(1)
}

guard CommandLine.arguments.count == 2 else {
  fail("usage: ocr-ios-screenshot.swift <png>")
}

let input = URL(fileURLWithPath: CommandLine.arguments[1])
guard let image = NSImage(contentsOf: input) else {
  fail("could not load screenshot: \(input.path)")
}

var proposedRect = NSRect(origin: .zero, size: image.size)
guard let cgImage = image.cgImage(forProposedRect: &proposedRect, context: nil, hints: nil) else {
  fail("could not decode screenshot: \(input.path)")
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["ko-KR", "en-US"]

let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up)
do {
  try handler.perform([request])
} catch {
  fail("Vision OCR failed: \(error.localizedDescription)")
}

let pixelWidth = Double(cgImage.width)
let pixelHeight = Double(cgImage.height)
let lines: [RecognizedLine] = (request.results ?? []).compactMap { observation in
  guard let candidate = observation.topCandidates(1).first else { return nil }
  let box = observation.boundingBox
  return RecognizedLine(
    text: candidate.string,
    confidence: candidate.confidence,
    x: box.minX * pixelWidth,
    y: (1 - box.maxY) * pixelHeight,
    width: box.width * pixelWidth,
    height: box.height * pixelHeight
  )
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
guard let output = try? encoder.encode(lines) else {
  fail("could not encode OCR result")
}
FileHandle.standardOutput.write(output)
FileHandle.standardOutput.write(Data("\n".utf8))
