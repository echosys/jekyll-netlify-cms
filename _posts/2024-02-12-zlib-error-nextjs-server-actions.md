---
title: >-
  How I Solved "Can't resolve 'zlib-sync'" error Using Discord.js sdk in Next.js
  14.1 Server Actions 
tags:
  - nextjs
date: '2024-02-12'
---
I started a new Nextjs project (Nextjs 14.1.0). I added `discord.js` to be able send a message to a discord channel.

I decided to give Nextjs server actions a go, therefore I created a separate file for this action:

```javascript
// lib/actions.ts

"use server";

import { Client } from "discord.js";

export async function create(formDate: FormData) {

  const discordClient = new Client({
    intents: ["GuildMessages", "Guilds"],
  });
  const result = await discordClient.login("// login token");
}
```

Then, I created a simple html form to use this action as the form action there:

```javascript
// app/page.tsx
"use client";
import { create } from "@/lib/actions";

export default function Home() {

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <form action={create}>
      </form>
    </main>
  );
}
```

very simple, yeah?

But immediately, I got this error:

```javascript
 ⨯ ./node_modules/@discordjs/ws/dist/index.js:561:53
Module not found: Can't resolve 'zlib-sync'
```

I think this is happening because Webpack is trying to include `discordjs` in client-side code (which it shouldn't). I spent many hours trying to google and asking ChatGPT and CoPilot ai, but wasn't successful.

Finally, I was able to solve it with this. First I had to install these packages:

```javascript
npm install zlib-sync node-loader --save-dev
```

zlib uses `.node` files, and webpack doesn't know how to deal with those files. Therefore I had to install _node-loader_ and configure it in webpack settings in _next.config_ file.

Added this section in _next.config.mjs_ file:

```javascript
const nextConfig = {
    webpack: (config, options) => {
        config.module.rules.push({
          test: /\.node/,
          use: 'node-loader'
        })
     
        return config
      },
};
```

Now the problem is solved. I couldn't find this answer anywhere else, and it took me hours to figure it out, so I decided to share it here.
