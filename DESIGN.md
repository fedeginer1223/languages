# LangLearn - Design System

## Overview

Modern, beautiful language learning platform with AI-powered features, built with React, TypeScript, and Tailwind CSS.

## Color Branding

### Primary Colors (Blue)
- **Primary 50-950**: Sky blue gradient from light to dark
- **Main Brand**: `primary-600` (#0284c7)
- **Hover**: `primary-700` (#0369a1)

### Secondary Colors (Purple)
- **Secondary 50-950**: Purple gradient for accents
- **Used for**: Badges, highlights, special features

### Status Colors
- **Success**: Green tones (#22c55e)
- **Warning**: Yellow/Amber tones (#f59e0b)
- **Danger**: Red tones (#ef4444)

## Components

### Layout
- **Sidebar Navigation**: Fixed left sidebar with gradient background
- **Responsive**: Mobile-friendly with hamburger menu
- **Top Bar**: Clean header with navigation context
- **Main Content**: Centered, max-width container

### UI Components

#### Button
- **Variants**: primary, secondary, danger, ghost
- **Sizes**: sm, md, lg
- **Features**: Hover states, focus rings, disabled states

#### Card
- **Base**: White background with border
- **Effects**: Shadow on hover, rounded corners
- **Padding**: Generous spacing (1.5rem)

#### Badge
- **Variants**: default, success, warning, danger
- **Usage**: Stats, status indicators, counts
- **Style**: Rounded-full, small text

#### Input
- **Features**: Labels, focus states, validation
- **Style**: Border with focus ring effect
- **Accessibility**: Proper labeling

## Layout Structure

```
┌─────────────────────────────────────────┐
│  Sidebar (fixed)     │   Main Content   │
│                      │                  │
│  ┌──────────┐       │  ┌────────────┐  │
│  │ Logo     │       │  │ Top Bar    │  │
│  └──────────┘       │  └────────────┘  │
│                      │                  │
│  Navigation          │  Page Content   │
│  - Home              │                  │
│  - Languages         │  Cards & Grid   │
│                      │                  │
│  Footer              │                  │
└─────────────────────────────────────────┘
```

## Features

### Sidebar
- **Logo**: "LangLearn" with graduation cap icon
- **Navigation**: Icon + text navigation items
- **Active State**: Highlighted with background
- **Footer**: "Made with Claude Code" attribution

### Languages Page
- **Grid Layout**: Responsive 1-3 column grid
- **Cards**: Clickable language cards with hover effects
- **Stats**: Badges showing topics, words, verbs count
- **Success Rate**: Color-coded success badges
- **Actions**: Train button, stats button, delete button
- **Empty State**: Helpful message with CTA

## Typography

- **Headings**: Bold, gray-900
- **Body**: gray-600
- **Labels**: gray-700, medium weight
- **Small text**: text-xs or text-sm

## Spacing

- **Container**: max-w-7xl mx-auto
- **Padding**: p-6 for main content
- **Gaps**: gap-4 to gap-8 for layouts
- **Card Padding**: p-6

## Responsive Design

### Breakpoints (Tailwind defaults)
- **sm**: 640px - Mobile landscape
- **md**: 768px - Tablet
- **lg**: 1024px - Desktop
- **xl**: 1280px - Large desktop

### Responsive Features
- Sidebar collapses to hamburger menu on mobile
- Grid adjusts from 1 to 3 columns based on screen size
- Button text may hide on smaller screens
- Card layouts stack on mobile

## Icons

Using **lucide-react** for consistent, beautiful icons:
- Navigation: Home, Languages, BookOpen, GraduationCap
- Actions: Plus, Trash2, BarChart3
- UI: Menu, X, ChevronRight

## Animations & Transitions

- **Hover**: Smooth scale/shadow on cards
- **Button**: Background color transitions
- **Sidebar**: Slide animation on mobile
- **Focus**: Ring effects on inputs/buttons

## Accessibility

- **Focus States**: Clear focus rings (ring-2)
- **Color Contrast**: WCAG AA compliant
- **Labels**: Proper labeling on form inputs
- **Keyboard**: Full keyboard navigation support
- **Screen Readers**: Semantic HTML structure

## Best Practices

1. **Mobile First**: Design for mobile, enhance for desktop
2. **Consistent Spacing**: Use Tailwind spacing scale
3. **Color Usage**: Primary for main actions, gray for secondary
4. **Typography**: Clear hierarchy with size and weight
5. **Feedback**: Visual feedback on all interactions
6. **Loading States**: Show loading indicators
7. **Error States**: Clear error messages
8. **Empty States**: Helpful messages and CTAs

## Future Enhancements

- Dark mode support
- More color themes
- Custom animations
- Progress indicators
- Notification system
- Advanced charts for stats
- Gamification elements
