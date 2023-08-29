import type { Template } from "./types";

const template: Template = {
  name: "testimonials",
  description: "a testimonials section",
  template: [
    {
      type: "instance",
      component: "Box",
      children: [
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

              tokens: ["__ws:1v5IJEOoLvrxECZAoBE33"],
            },
            {
              type: "instance",
              component: "Text",
              children: [
                {
                  type: "text",
                  value:
                    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec feugiat rhoncus mollis. Integer feugiat nisi id pulvinar pretium. Suspendisse potenti. Proin lobortis viverra sagittis. Curabitur massa nisi, lobortis vel rhoncus suscipit, fermentum quis augue. Aliquam vehicula et felis eu porttitor.",
                },
              ],
            },
          ],

          tokens: ["__ws:Nw0JLklLhUPyef37jrDKi"],
        },
        {
          type: "instance",
          component: "Box",
          children: [
            {
              type: "instance",
              component: "Image",
              tokens: ["__ws:DdMo8CT8N4glKLYTzV4j0"],
              children: [],
            },
            {
              type: "instance",
              component: "Box",
              children: [
                {
                  type: "instance",
                  component: "Blockquote",
                  children: [
                    {
                      type: "instance",
                      component: "Text",
                      children: [
                        {
                          type: "text",
                          value: "Blockquote you can edit",
                        },
                      ],
                    },
                  ],
                },
              ],

              tokens: ["__ws:Lrw4EqJBcIsDXIgMv6Y3U"],
            },
          ],

          tokens: ["__ws:Nw0JLklLhUPyef37jrDKi"],
        },
      ],

      tokens: [
        "__ws:kVuWQyumz9K8e7OJ1anqY",
        "__ws:uqkQ_F2YxSqn6Y__TxMe6",
        "__ws:OCPsSiwt53JCmwS7oQaAF",
      ],
    },
  ],
};
export default template;
