import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar-basic-utils/calendar"
import type { DayPickerSingleProps } from "react-day-picker"

type CalendarBasicProps = Omit<DayPickerSingleProps, "mode">

export default function CalendarBasic({ className, ...props }: CalendarBasicProps) {
  return <Calendar mode="single" className={cn("rounded-lg border bg-white", className)} {...props} />
}
