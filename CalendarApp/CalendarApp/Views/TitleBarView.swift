import SwiftUI

struct TitleBarView: View {
    @Binding var selectedView: CalendarViewType
    @Binding var currentDate: Date
    @Binding var showSidebar: Bool

    @State private var isHoveringClose = false
    @State private var isHoveringMinimize = false
    @State private var isHoveringFullscreen = false

    private let calendar = Calendar.current

    var body: some View {
        HStack(spacing: 0) {
            // Traffic Lights
            HStack(spacing: 8) {
                TrafficLightButton(color: .red, isHovering: $isHoveringClose, symbol: "xmark")
                TrafficLightButton(color: .yellow, isHovering: $isHoveringMinimize, symbol: "minus")
                TrafficLightButton(color: .green, isHovering: $isHoveringFullscreen, symbol: "arrow.up.left.and.arrow.down.right")
            }
            .padding(.leading, 12)

            Spacer()

            // Navigation and View Controls
            HStack(spacing: 16) {
                // Sidebar Toggle
                Button(action: { withAnimation { showSidebar.toggle() } }) {
                    Image(systemName: "sidebar.leading")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)

                Divider()
                    .frame(height: 16)

                // Navigation Arrows
                HStack(spacing: 4) {
                    Button(action: previousPeriod) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.secondary)
                            .frame(width: 24, height: 24)
                            .background(Color(NSColor.controlBackgroundColor))
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                    .buttonStyle(.plain)

                    Button(action: nextPeriod) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.secondary)
                            .frame(width: 24, height: 24)
                            .background(Color(NSColor.controlBackgroundColor))
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                    .buttonStyle(.plain)
                }

                // Today Button
                Button("Today") {
                    currentDate = Date()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)

                // Current Date Display
                Text(dateTitle)
                    .font(.system(size: 18, weight: .semibold))
                    .frame(minWidth: 200)
            }

            Spacer()

            // View Selector
            HStack(spacing: 0) {
                ForEach(CalendarViewType.allCases, id: \.self) { viewType in
                    Button(action: { selectedView = viewType }) {
                        Text(viewType.rawValue)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(selectedView == viewType ? .white : .primary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(
                                selectedView == viewType
                                    ? Color.accentColor
                                    : Color.clear
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(Color(NSColor.controlBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .padding(.trailing, 16)

            // Add Event Button
            Button(action: {}) {
                Image(systemName: "plus")
                    .font(.system(size: 14, weight: .medium))
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.regular)
            .padding(.trailing, 12)
        }
        .frame(height: 52)
        .background(VisualEffectView(material: .titlebar, blendingMode: .withinWindow))
    }

    var dateTitle: String {
        let formatter = DateFormatter()
        switch selectedView {
        case .day:
            formatter.dateFormat = "EEEE, MMMM d, yyyy"
        case .week:
            let weekStart = calendar.date(from: calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: currentDate))!
            let weekEnd = calendar.date(byAdding: .day, value: 6, to: weekStart)!
            let startFormatter = DateFormatter()
            startFormatter.dateFormat = "MMM d"
            let endFormatter = DateFormatter()
            endFormatter.dateFormat = "d, yyyy"
            return "\(startFormatter.string(from: weekStart)) – \(endFormatter.string(from: weekEnd))"
        case .month:
            formatter.dateFormat = "MMMM yyyy"
        case .year:
            formatter.dateFormat = "yyyy"
        }
        return formatter.string(from: currentDate)
    }

    func previousPeriod() {
        switch selectedView {
        case .day:
            currentDate = calendar.date(byAdding: .day, value: -1, to: currentDate) ?? currentDate
        case .week:
            currentDate = calendar.date(byAdding: .weekOfYear, value: -1, to: currentDate) ?? currentDate
        case .month:
            currentDate = calendar.date(byAdding: .month, value: -1, to: currentDate) ?? currentDate
        case .year:
            currentDate = calendar.date(byAdding: .year, value: -1, to: currentDate) ?? currentDate
        }
    }

    func nextPeriod() {
        switch selectedView {
        case .day:
            currentDate = calendar.date(byAdding: .day, value: 1, to: currentDate) ?? currentDate
        case .week:
            currentDate = calendar.date(byAdding: .weekOfYear, value: 1, to: currentDate) ?? currentDate
        case .month:
            currentDate = calendar.date(byAdding: .month, value: 1, to: currentDate) ?? currentDate
        case .year:
            currentDate = calendar.date(byAdding: .year, value: 1, to: currentDate) ?? currentDate
        }
    }
}

struct TrafficLightButton: View {
    let color: Color
    @Binding var isHovering: Bool
    let symbol: String

    var body: some View {
        ZStack {
            Circle()
                .fill(color)
                .frame(width: 12, height: 12)

            if isHovering {
                Image(systemName: symbol)
                    .font(.system(size: 7, weight: .bold))
                    .foregroundColor(.black.opacity(0.5))
            }
        }
        .onHover { hovering in
            isHovering = hovering
        }
    }
}

struct VisualEffectView: NSViewRepresentable {
    let material: NSVisualEffectView.Material
    let blendingMode: NSVisualEffectView.BlendingMode

    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = material
        view.blendingMode = blendingMode
        view.state = .active
        return view
    }

    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {
        nsView.material = material
        nsView.blendingMode = blendingMode
    }
}

#Preview {
    TitleBarView(
        selectedView: .constant(.month),
        currentDate: .constant(Date()),
        showSidebar: .constant(true)
    )
}
