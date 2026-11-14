// window.bob belongs in the application adapter.
export const documentation = "window.bob";
export const viewport = () => window.innerWidth;
export const platformAction = (props: { bob: () => void }) => props.bob();
