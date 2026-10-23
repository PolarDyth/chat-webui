'use client';

import { motion, type Variants } from 'motion/react';
import { memo, useMemo, useRef } from 'react';

const line: Variants = {
  hidden: {},
  shown: {
    transition: { staggerChildren: 0.04 },
  },
};

const word: Variants = {
  hidden: { opacity: 0, y: 4, filter: 'blur(3px)' },
  shown: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.25, ease: 'easeOut' },
  },
};

/**
 * The chat title. Keyed by text: whenever the title changes (heuristic
 * placeholder → AI title, or a rename), it remounts and the new title
 * animates in word by word, blur → sharp. The first mount renders statically
 * so opening a chat doesn't replay the animation.
 */
export const ChatTitle = memo(function ChatTitle({ title }: { title: string }) {
  const words = useMemo(() => title.split(/\s+/).filter(Boolean), [title]);
  // Title present at mount: matching it means "no change yet", so no animation.
  const mountedTitleRef = useRef(title);
  const changed = title !== mountedTitleRef.current;

  return (
    <motion.h1
      key={title}
      initial={changed ? 'hidden' : false}
      animate="shown"
      variants={line}
      className="min-w-0 flex-1 truncate text-sm font-medium"
    >
      {words.map((w, i) => (
        <motion.span
          key={`${i}-${w}`}
          variants={word}
          className="inline-block whitespace-pre"
        >
          {i < words.length - 1 ? `${w} ` : w}
        </motion.span>
      ))}
    </motion.h1>
  );
});
