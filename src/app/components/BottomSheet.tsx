import { ReactNode, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface BottomSheetProps {
  children: ReactNode;
  defaultExpanded?: boolean;
  snapPoints?: number[];
}

export function BottomSheet({
  children,
  defaultExpanded = false,
}: BottomSheetProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <motion.div
      className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[28px] border border-neutral-200 shadow-[0_-16px_48px_rgba(15,23,42,0.16)]"
      initial={{ y: isExpanded ? 0 : "60%" }}
      animate={{ y: isExpanded ? 0 : "60%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      style={{ zIndex: 1000 }}
    >
      {/* Handle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full pt-3 pb-2 flex items-center justify-center focus:outline-none active:bg-neutral-50 transition-colors rounded-t-[28px]"
      >
        <div className="w-10 h-1 bg-neutral-300 rounded-full" />
      </button>

      {/* Content */}
      <div className="px-5 pb-8 overflow-y-auto max-h-[72vh] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>

      {/* Expand/Collapse Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="absolute top-3 right-5 p-2 hover:bg-neutral-100 rounded-full transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-5 h-5 text-neutral-500" />
        ) : (
          <ChevronUp className="w-5 h-5 text-neutral-500" />
        )}
      </button>
    </motion.div>
  );
}
