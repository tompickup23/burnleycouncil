import SwiftUI

struct DockView: View {
    @Binding var isVisible: Bool
    @State private var hoveredIndex: Int? = nil

    let dockItems: [DockItem] = [
        DockItem(name: "Finder", icon: "folder.fill", color: .blue),
        DockItem(name: "Safari", icon: "safari.fill", color: .blue),
        DockItem(name: "Mail", icon: "envelope.fill", color: .blue),
        DockItem(name: "Messages", icon: "message.fill", color: .green),
        DockItem(name: "Calendar", icon: "calendar", color: .red),
        DockItem(name: "Notes", icon: "note.text", color: .yellow),
        DockItem(name: "Reminders", icon: "checklist", color: .orange),
        DockItem(name: "Photos", icon: "photo.fill", color: .pink),
        DockItem(name: "Music", icon: "music.note", color: .red),
        DockItem(name: "Settings", icon: "gearshape.fill", color: .gray),
    ]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(dockItems.enumerated()), id: \.element.id) { index, item in
                DockItemView(
                    item: item,
                    isHovered: hoveredIndex == index,
                    neighborHoverOffset: neighborOffset(for: index)
                )
                .onHover { hovering in
                    withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) {
                        hoveredIndex = hovering ? index : nil
                    }
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 4)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color.white.opacity(0.2), lineWidth: 0.5)
                )
                .shadow(color: .black.opacity(0.3), radius: 20, y: 5)
        )
        .padding(.bottom, 8)
        .onHover { hovering in
            if hovering {
                isVisible = true
            }
        }
    }

    func neighborOffset(for index: Int) -> CGFloat {
        guard let hovered = hoveredIndex else { return 0 }
        let distance = abs(index - hovered)
        if distance == 0 { return 0 }
        if distance == 1 { return 0.5 }
        if distance == 2 { return 0.25 }
        return 0
    }
}

struct DockItem: Identifiable {
    let id = UUID()
    let name: String
    let icon: String
    let color: Color
}

struct DockItemView: View {
    let item: DockItem
    let isHovered: Bool
    let neighborHoverOffset: CGFloat

    var scale: CGFloat {
        if isHovered { return 1.5 }
        return 1 + (neighborHoverOffset * 0.5)
    }

    var yOffset: CGFloat {
        if isHovered { return -20 }
        return -neighborHoverOffset * 20
    }

    var body: some View {
        VStack(spacing: 0) {
            if isHovered {
                Text(item.name)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.primary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        RoundedRectangle(cornerRadius: 4)
                            .fill(.ultraThinMaterial)
                    )
                    .offset(y: -8)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }

            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(
                        LinearGradient(
                            colors: [item.color.opacity(0.8), item.color],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .frame(width: 48, height: 48)
                    .shadow(color: item.color.opacity(0.4), radius: isHovered ? 8 : 4, y: 2)

                Image(systemName: item.icon)
                    .font(.system(size: 24))
                    .foregroundColor(.white)
            }
            .scaleEffect(scale)
            .offset(y: yOffset)

            // Indicator dot for running apps
            Circle()
                .fill(Color.primary.opacity(0.5))
                .frame(width: 4, height: 4)
                .opacity(item.name == "Calendar" || item.name == "Finder" ? 1 : 0)
                .padding(.top, 4)
        }
        .frame(width: 60)
        .animation(.spring(response: 0.2, dampingFraction: 0.6), value: isHovered)
        .animation(.spring(response: 0.2, dampingFraction: 0.6), value: neighborHoverOffset)
    }
}

#Preview {
    ZStack {
        Color.gray.opacity(0.3)
        DockView(isVisible: .constant(true))
    }
    .frame(width: 800, height: 200)
}
