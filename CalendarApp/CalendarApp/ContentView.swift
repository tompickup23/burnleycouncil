import SwiftUI

struct ContentView: View {
    @State private var showDock = false
    @State private var selectedView: CalendarViewType = .month
    @State private var currentDate = Date()
    @State private var sidebarWidth: CGFloat = 240
    @State private var showSidebar = true

    var body: some View {
        ZStack(alignment: .bottom) {
            VStack(spacing: 0) {
                // Custom Title Bar
                TitleBarView(
                    selectedView: $selectedView,
                    currentDate: $currentDate,
                    showSidebar: $showSidebar
                )

                // Main Content
                HStack(spacing: 0) {
                    if showSidebar {
                        SidebarView(currentDate: $currentDate, selectedView: $selectedView)
                            .frame(width: sidebarWidth)

                        Divider()
                    }

                    CalendarContentView(
                        selectedView: selectedView,
                        currentDate: $currentDate
                    )
                }
            }
            .background(Color(NSColor.windowBackgroundColor))

            // Dock
            DockView(isVisible: $showDock)
                .offset(y: showDock ? 0 : 80)
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: showDock)
        }
        .frame(minWidth: 1000, minHeight: 700)
        .onHover { hovering in
            // Show dock when hovering near bottom
        }
        .overlay(alignment: .bottom) {
            // Invisible hover area for dock
            Color.clear
                .frame(height: 10)
                .onHover { hovering in
                    withAnimation {
                        showDock = hovering
                    }
                }
        }
    }
}

enum CalendarViewType: String, CaseIterable {
    case day = "Day"
    case week = "Week"
    case month = "Month"
    case year = "Year"
}

#Preview {
    ContentView()
}
