import SwiftUI

struct SidebarView: View {
    @Binding var currentDate: Date
    @Binding var selectedView: CalendarViewType
    @State private var searchText = ""
    @State private var expandedSections: Set<String> = ["My Calendars", "Other"]

    var body: some View {
        VStack(spacing: 0) {
            // Search
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.secondary)
                    .font(.system(size: 12))

                TextField("Search", text: $searchText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
            }
            .padding(8)
            .background(Color(NSColor.controlBackgroundColor))
            .cornerRadius(6)
            .padding(.horizontal, 12)
            .padding(.top, 12)

            // Mini Calendar
            MiniCalendarWidget(currentDate: $currentDate, selectedView: $selectedView)
                .padding(.horizontal, 12)
                .padding(.top, 16)

            Divider()
                .padding(.vertical, 12)

            // Calendar Lists
            ScrollView {
                VStack(alignment: .leading, spacing: 4) {
                    CalendarSection(
                        title: "My Calendars",
                        isExpanded: expandedSections.contains("My Calendars"),
                        onToggle: { toggleSection("My Calendars") }
                    ) {
                        CalendarListItem(name: "Home", color: .blue, isSelected: true)
                        CalendarListItem(name: "Work", color: .purple, isSelected: true)
                        CalendarListItem(name: "Personal", color: .green, isSelected: true)
                        CalendarListItem(name: "Birthdays", color: .orange, isSelected: false)
                    }

                    CalendarSection(
                        title: "Other",
                        isExpanded: expandedSections.contains("Other"),
                        onToggle: { toggleSection("Other") }
                    ) {
                        CalendarListItem(name: "Holidays", color: .red, isSelected: true)
                        CalendarListItem(name: "Shared", color: .cyan, isSelected: false)
                    }
                }
                .padding(.horizontal, 12)
            }

            Spacer()
        }
        .background(VisualEffectView(material: .sidebar, blendingMode: .behindWindow))
    }

    func toggleSection(_ section: String) {
        if expandedSections.contains(section) {
            expandedSections.remove(section)
        } else {
            expandedSections.insert(section)
        }
    }
}

struct MiniCalendarWidget: View {
    @Binding var currentDate: Date
    @Binding var selectedView: CalendarViewType
    private let calendar = Calendar.current
    private let daysOfWeek = ["S", "M", "T", "W", "T", "F", "S"]
    @State private var displayMonth: Date

    init(currentDate: Binding<Date>, selectedView: Binding<CalendarViewType>) {
        self._currentDate = currentDate
        self._selectedView = selectedView
        self._displayMonth = State(initialValue: currentDate.wrappedValue)
    }

    var monthYear: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        return formatter.string(from: displayMonth)
    }

    var monthDays: [[Date?]] {
        let interval = calendar.dateInterval(of: .month, for: displayMonth)!
        let firstDay = interval.start
        let firstWeekday = calendar.component(.weekday, from: firstDay)
        let daysInMonth = calendar.range(of: .day, in: .month, for: displayMonth)!.count

        var days: [Date?] = Array(repeating: nil, count: firstWeekday - 1)

        for day in 0..<daysInMonth {
            if let date = calendar.date(byAdding: .day, value: day, to: firstDay) {
                days.append(date)
            }
        }

        while days.count % 7 != 0 {
            days.append(nil)
        }

        return stride(from: 0, to: days.count, by: 7).map { Array(days[$0..<min($0 + 7, days.count)]) }
    }

    var body: some View {
        VStack(spacing: 8) {
            // Month navigation
            HStack {
                Button(action: previousMonth) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)

                Spacer()

                Text(monthYear)
                    .font(.system(size: 13, weight: .semibold))

                Spacer()

                Button(action: nextMonth) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
            }

            // Day headers
            HStack(spacing: 0) {
                ForEach(daysOfWeek, id: \.self) { day in
                    Text(day)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }

            // Days grid
            VStack(spacing: 2) {
                ForEach(Array(monthDays.enumerated()), id: \.offset) { _, week in
                    HStack(spacing: 0) {
                        ForEach(0..<7, id: \.self) { index in
                            if let date = week[safe: index], let d = date {
                                MiniDayButton(
                                    date: d,
                                    isToday: calendar.isDateInToday(d),
                                    isSelected: calendar.isDate(d, inSameDayAs: currentDate),
                                    onTap: {
                                        currentDate = d
                                        if selectedView == .month {
                                            selectedView = .day
                                        }
                                    }
                                )
                            } else {
                                Text("")
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 24)
                            }
                        }
                    }
                }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(NSColor.controlBackgroundColor))
        )
        .onChange(of: currentDate) { _, newValue in
            // Keep display month in sync with navigation
            if !calendar.isDate(displayMonth, equalTo: newValue, toGranularity: .month) {
                displayMonth = newValue
            }
        }
    }

    func previousMonth() {
        displayMonth = calendar.date(byAdding: .month, value: -1, to: displayMonth) ?? displayMonth
    }

    func nextMonth() {
        displayMonth = calendar.date(byAdding: .month, value: 1, to: displayMonth) ?? displayMonth
    }
}

struct MiniDayButton: View {
    let date: Date
    let isToday: Bool
    let isSelected: Bool
    let onTap: () -> Void
    private let calendar = Calendar.current

    var body: some View {
        Button(action: onTap) {
            Text("\(calendar.component(.day, from: date))")
                .font(.system(size: 11, weight: isToday || isSelected ? .semibold : .regular))
                .foregroundColor(foregroundColor)
                .frame(maxWidth: .infinity)
                .frame(height: 24)
                .background(
                    Circle()
                        .fill(backgroundColor)
                        .frame(width: 22, height: 22)
                )
        }
        .buttonStyle(.plain)
    }

    var foregroundColor: Color {
        if isSelected {
            return .white
        }
        if isToday {
            return .accentColor
        }
        return .primary
    }

    var backgroundColor: Color {
        if isSelected {
            return .accentColor
        }
        return .clear
    }
}

struct CalendarSection<Content: View>: View {
    let title: String
    let isExpanded: Bool
    let onToggle: () -> Void
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button(action: onToggle) {
                HStack {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.secondary)
                        .frame(width: 12)

                    Text(title)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.secondary)

                    Spacer()
                }
            }
            .buttonStyle(.plain)
            .padding(.vertical, 4)

            if isExpanded {
                content
                    .padding(.leading, 16)
            }
        }
    }
}

struct CalendarListItem: View {
    let name: String
    let color: Color
    @State var isSelected: Bool

    var body: some View {
        Button(action: { isSelected.toggle() }) {
            HStack(spacing: 8) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 14))
                    .foregroundColor(isSelected ? color : .secondary)

                Text(name)
                    .font(.system(size: 13))
                    .foregroundColor(.primary)

                Spacer()
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    SidebarView(currentDate: .constant(Date()), selectedView: .constant(.month))
        .frame(width: 240, height: 600)
}
