import Cocoa
// Print on-screen DOSBox window ids: id layer onscreen width height
let l = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as! [[String: Any]]
for w in l {
  if let o = w[kCGWindowOwnerName as String] as? String, o.lowercased().contains("dosbox"),
     (w[kCGWindowLayer as String] as? Int) == 0 {
    let b = w[kCGWindowBounds as String] as! [String: Any]
    print(w[kCGWindowNumber as String]!, 0, 1, b["Width"]!, b["Height"]!)
  }
}
