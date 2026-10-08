export const SAMPLES = [
  { id: "cat", src: "/samples/cat.jpg", label: "Cat" },
  { id: "typewriter", src: "/samples/typewriter.jpg", label: "Typewriter" },
  { id: "ridge", src: "/samples/ridge.jpg", label: "Ridge" },
  { id: "facade", src: "/samples/facade.jpg", label: "Facade" },
] as const;

export type SampleId = (typeof SAMPLES)[number]["id"];
