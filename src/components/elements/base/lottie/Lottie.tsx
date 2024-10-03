import { memo } from "react";
import { LottieProps } from "./Lottie.types";
import { DotLottiePlayer } from "@dotlottie/react-player";
import "@dotlottie/react-player/dist/index.css";

const LottieBase = ({
  category,
  path,
  height,
  width,
  classNames,
  max,
}: LottieProps) => {
  const styles = {
    height,
    width,
  };

  const randomUrl = `/img/lottie/${category ? `${category}/` : ""}${path}${
    max ? `-${Math.floor(Math.random() * max) + 1}` : ""
  }.lottie`;

  return (
    <div>
      <DotLottiePlayer
        src={randomUrl}
        style={styles}
        className={`${classNames}`}
        autoplay
        loop
      />
    </div>
  );
};

export const Lottie = memo(LottieBase);
