import SwiftUI

struct CalendarContentView: View {
    let selectedView: CalendarViewType
    @Binding var currentDate: Date

    var body: some View {
        Group {
            switch selectedView {
            case .day:
                DayView(currentDate: $currentDate)
            case .week:
                WeekView(currentDate: $currentDate)
            case .month:
                MonthView(currentDate: $currentDate)
            case .year:
                YearView(currentDate: $currentDate)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(NSColor.textBackgroundColor))
    }
}

// MARK: - Day View
struct DayView: View {
    @Binding var currentDate: Date
    private let hours = Array(0..<24)

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // All day section
                HStack {
                    Text("all-day")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .frame(width: 60, alignment: .trailing)
                        .padding(.trailing, 8)

                    Rectangle()
                        .fill(Color(NSColor.separatorColor))
                        .frame(height: 1)
                }
                .padding(.vertical, 8)
                .background(Color(NSColor.controlBackgroundColor))

                // Hour rows
                ForEach(hours, id: \.self) { hour in
                    HourRow(hour: hour)
                }
            }
        }
    }
}

struct HourRow: View {
    let hour: Int

    var hourString: String {
        if hour == 0 { return "12 AM" }
        if hour < 12 { return "\(hour) AM" }
        if hour == 12 { return "12 PM" }
        return "\(hour - 12) PM"
    }

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            Text(hourString)
                .font(.system(size: 11))
                .foregroundColor(.secondary)
                .frame(width: 60, alignment: .trailing)
                .padding(.trailing, 8)
                .offset(y: -6)

            VStack(spacing: 0) {
                Rectangle()
                    .fill(Color(NSColor.separatorColor))
                    .frame(height: 1)

                Rectangle()
                    .fill(Color.clear)
                    .frame(height: 59)
            }
        }
    }
}

// MARK: - Week View
struct WeekView: View {
    @Binding var currentDate: Date
    private let calendar = Calendar.current
    private let hours = Array(0..<24)

    var weekDays: [Date] {
        let startOfWeek = calendar.date(from: calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: currentDate))!
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: startOfWeek) }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Day headers
            HStack(spacing: 0) {
                Text("")
                    .frame(width: 68)

                ForEach(weekDays, id: \.self) { date in
                    WeekDayHeader(date: date, isToday: calendar.isDateInToday(date))
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.vertical, 8)
            .background(Color(NSColor.controlBackgroundColor))

            Divider()

            // Time grid
            ScrollView {
                HStack(spacing: 0) {
                    // Time column
                    VStack(spacing: 0) {
                        ForEach(hours, id: \.self) { hour in
                            Text(hourString(for: hour))
                                .font(.system(size: 11))
                                .foregroundColor(.secondary)
                                .frame(width: 60, height: 60, alignment: .topTrailing)
                                .padding(.trailing, 8)
                                .offset(y: -6)
                        }
                    }

                    // Day columns
                    ForEach(weekDays, id: \.self) { date in
                        VStack(spacing: 0) {
                            ForEach(hours, id: \.self) { _ in
                                Rectangle()
                                    .fill(Color.clear)
                                    .frame(height: 60)
                                    .overlay(
                                        Rectangle()
                                            .fill(Color(NSColor.separatorColor))
                                            .frame(height: 1),
                                        alignment: .top
                                    )
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .background(
                            Rectangle()
                                .fill(Color(NSColor.separatorColor).opacity(0.3))
                                .frame(width: 1),
                            alignment: .leading
                        )
                    }
                }
            }
        }
    }

    func hourString(for hour: Int) -> String {
        if hour == 0 { return "12 AM" }
        if hour < 12 { return "\(hour) AM" }
        if hour == 12 { return "12 PM" }
        return "\(hour - 12) PM"
    }
}

struct WeekDayHeader: View {
    let date: Date
    let isToday: Bool
    private let calendar = Calendar.current

    var dayName: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE"
        return formatter.string(from: date).uppercased()
    }

    var dayNumber: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "d"
        return formatter.string(from: date)
    }

    var body: some View {
        VStack(spacing: 2) {
            Text(dayName)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(isToday ? .accentColor : .secondary)

            Text(dayNumber)
                .font(.system(size: 20, weight: .light))
                .foregroundColor(isToday ? .white : .primary)
                .frame(width: 32, height: 32)
                .background(
                    Circle()
                        .fill(isToday ? Color.accentColor : Color.clear)
                )
        }
    }
}

// MARK: - Month View
struct MonthView: View {
    @Binding var currentDate: Date
    private let calendar = Calendar.current
    private let daysOfWeek = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

    var monthDays: [[Date?]] {
        let interval = calendar.dateInterval(of: .month, for: currentDate)!
        let firstDay = interval.start
        let firstWeekday = calendar.component(.weekday, from: firstDay)
        let daysInMonth = calendar.range(of: .day, in: .month, for: currentDate)!.count

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
        VStack(spacing: 0) {
            // Day headers
            HStack(spacing: 0) {
                ForEach(daysOfWeek, id: \.self) { day in
                    Text(day)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.vertical, 8)
            .background(Color(NSColor.controlBackgroundColor))

            Divider()

            // Calendar grid
            VStack(spacing: 0) {
                ForEach(Array(monthDays.enumerated()), id: \.offset) { _, week in
                    HStack(spacing: 0) {
                        ForEach(0..<7, id: \.self) { index in
                            MonthDayCell(date: week[safe: index] ?? nil, currentDate: currentDate)
                        }
                    }
                    .frame(maxHeight: .infinity)

                    if week != monthDays.last {
                        Divider()
                    }
                }
            }
        }
    }
}

struct MonthDayCell: View {
    let date: Date?
    let currentDate: Date
    private let calendar = Calendar.current

    var isToday: Bool {
        guard let date = date else { return false }
        return calendar.isDateInToday(date)
    }

    var isCurrentMonth: Bool {
        guard let date = date else { return false }
        return calendar.isDate(date, equalTo: currentDate, toGranularity: .month)
    }

    var body: some View {
        VStack(alignment: .leading) {
            if let date = date {
                HStack {
                    Text("\(calendar.component(.day, from: date))")
                        .font(.system(size: 13, weight: isToday ? .semibold : .regular))
                        .foregroundColor(isToday ? .white : (isCurrentMonth ? .primary : .secondary))
                        .frame(width: 24, height: 24)
                        .background(
                            Circle()
                                .fill(isToday ? Color.accentColor : Color.clear)
                        )
                    Spacer()
                }
                .padding(6)

                Spacer()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(NSColor.textBackgroundColor))
        .overlay(
            Rectangle()
                .fill(Color(NSColor.separatorColor).opacity(0.3))
                .frame(width: 1),
            alignment: .trailing
        )
    }
}

// MARK: - Year View
struct YearView: View {
    @Binding var currentDate: Date
    private let calendar = Calendar.current
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 20), count: 4)

    var months: [Date] {
        let year = calendar.component(.year, from: currentDate)
        return (1...12).compactMap { month in
            calendar.date(from: DateComponents(year: year, month: month, day: 1))
        }
    }

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 20) {
                ForEach(months, id: \.self) { month in
                    MiniMonthView(date: month, currentDate: $currentDate)
                }
            }
            .padding(20)
        }
    }
}

struct MiniMonthView: View {
    let date: Date
    @Binding var currentDate: Date
    private let calendar = Calendar.current
    private let daysOfWeek = ["S", "M", "T", "W", "T", "F", "S"]

    var monthName: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM"
        return formatter.string(from: date)
    }

    var monthDays: [[Date?]] {
        let interval = calendar.dateInterval(of: .month, for: date)!
        let firstDay = interval.start
        let firstWeekday = calendar.component(.weekday, from: firstDay)
        let daysInMonth = calendar.range(of: .day, in: .month, for: date)!.count

        var days: [Date?] = Array(repeating: nil, count: firstWeekday - 1)

        for day in 0..<daysInMonth {
            if let d = calendar.date(byAdding: .day, value: day, to: firstDay) {
                days.append(d)
            }
        }

        while days.count % 7 != 0 {
            days.append(nil)
        }

        return stride(from: 0, to: days.count, by: 7).map { Array(days[$0..<min($0 + 7, days.count)]) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(monthName)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.primary)

            // Day headers
            HStack(spacing: 0) {
                ForEach(daysOfWeek, id: \.self) { day in
                    Text(day)
                        .font(.system(size: 9))
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                }
            }

            // Days grid
            VStack(spacing: 2) {
                ForEach(Array(monthDays.enumerated()), id: \.offset) { _, week in
                    HStack(spacing: 0) {
                        ForEach(0..<7, id: \.self) { index in
                            if let day = week[safe: index], let d = day {
                                let isToday = calendar.isDateInToday(d)
                                Text("\(calendar.component(.day, from: d))")
                                    .font(.system(size: 10, weight: isToday ? .bold : .regular))
                                    .foregroundColor(isToday ? .white : .primary)
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 16)
                                    .background(
                                        Circle()
                                            .fill(isToday ? Color.accentColor : Color.clear)
                                            .frame(width: 16, height: 16)
                                    )
                            } else {
                                Text("")
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 16)
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
        .onTapGesture {
            currentDate = date
        }
    }
}

// MARK: - Helper Extension
extension Array {
    subscript(safe index: Int) -> Element? {
        return indices.contains(index) ? self[index] : nil
    }
}

#Preview {
    CalendarContentView(selectedView: .month, currentDate: .constant(Date()))
}
