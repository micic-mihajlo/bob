import { Check } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { cx } from "./classes";

/** The reference UI's checkbox: a native input with the drawn box over it. */
export function Checkbox({ className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <span className={cx("ui-checkbox", className)}>
      <input className="ui-checkbox-input" type="checkbox" data-cuelume-toggle="" {...rest} />
      <span className="ui-checkbox-visual" aria-hidden="true">
        <Check />
      </span>
    </span>
  );
}
