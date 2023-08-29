import type { Template } from "./types";

const template: Template = {
  name: "hero",
  description: "a hero section",
  template: [
    {
      type: "instance",
      component: "Box",
      children: [
        {
          type: "instance",
          component: "Heading",
          children: [
            {
              type: "text",
              value: "Heading you can edit",
            },
          ],
          tokens: ["__ws:9472fjSBwwpMNKt2N7Agy"],
        },
        {
          type: "instance",
          component: "Box",
          children: [
            {
              type: "instance",
              component: "Text",
              children: [
                {
                  type: "text",
                  value: "The text you can edit",
                },
              ],
            },
          ],
          tokens: ["__ws:Lrw4EqJBcIsDXIgMv6Y3U"],
        },
      ],
      tokens: ["__ws:uqkQ_F2YxSqn6Y__TxMe6", "__ws:OCPsSiwt53JCmwS7oQaAF"],
    },
  ],
};

export default template;
