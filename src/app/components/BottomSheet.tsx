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
      className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl"
      initial={{ y: isExpanded ? 0 : "60%" }}
      animate={{ y: isExpanded ? 0 : "60%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      style={{ zIndex: 10 }}
    >
      {/* Handle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full py-3 flex items-center justify-center focus:outline-none active:bg-neutral-50 transition-colors"
      >
        <div className="w-10 h-1 bg-neutral-300 rounded-full" />
      </button>

      {/* Content */}
      <div className="px-5 pb-8 overflow-y-auto max-h-[70vh]">
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
