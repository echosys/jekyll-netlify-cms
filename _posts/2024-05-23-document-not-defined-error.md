---
title: How I Solved "Yjs was already imported" and "document is not defined" Errors in Remirror 2, Nextjs 14.2
tags:
  - nextjs
  - react
  - reactjs
  - typescript
date: '2024-05-23'
---
So I'm using Remirror 2 editor in a React component in a Nextjs app.

I realised that every time I opened the page containing that editor component, it would give me HTTP 500 error and the following error messages:

```javascript
Yjs was already imported. This breaks constructor checks and will lead to issues! - https://github.com/yjs/yjs/issues/438

 ⨯ Internal error: ReferenceError: document is not defined
```

Sometimes I was getting a different error, the error was this:

```javascript
Error: Unable to retrieve the document from the global scope. 
It seems that you are running Remirror in a non-browser environment. Remirror need browser APIs to work. 
If you are using Jest (or other testing frameworks), make sure that you are using the JSDOM environment (https://jestjs.io/docs/29.0/configuration#testenvironment-string). 
If you are using Next.js (or other server-side rendering frameworks), please use dynamic import with `ssr: false` to load the editor component without rendering it on the server (https://nextjs.org/docs/advanced-features/dynamic-import#with-no-ssr). 
If you are using Node.js, you can install JSDOM and Remirror will try to use it automatically, or you can create a fake document and pass it to Remirror
```

It even stopped search engines (like Google and Bing) to index that page ([online markdown editor](https://www.jekyllpad.com/tools/online-markdown-wysiwyg-editor)) on my projects.

## Investigation and Debugging

I read a lot and got some clues from [here](https://github.com/yjs/yjs/issues/438) and [here](https://github.com/remirror/remirror/discussions/2095). Unfortunately those didn't help me.

I decided to investigate the stack trace to be able to find where it is throwing those errors.

That pointed me to the function in my code that was originating this error. I realised that, that function was a custom React hook I built. It wasn't in the React component, but in the React hook i custom-built to use with my component.

```javascript
export function useContentEditor() {
	/// some stuff

const visualEditorManager = useRemirror({
    extensions: visualEditorExtensions,
    stringHandler: visualEditorStringHandler,
    content: value,
    selection: "start",
  });

  const sourceEditorManager = useRemirror({
    extensions: sourceEditorExtensions,
    content: value,
    stringHandler: "html",
  });

// some other stuff
}
```

This helped me to put the puzzle pieces together, Nextjs was rendering this client-side React hook and components on the server before sending it to client. Obviously there is no browser or document available on the server, therefore it was throwing that.

I found 2 solutions to this, I'll share them.

## Solution 1 - Nextjs Dynamic Component Load

As it is stated in the error message, I could use the [recommended dynamic component load](https://nextjs.org/docs/pages/building-your-application/optimizing/lazy-loading#with-no-ssr) by Nextjs. In order to do that, I put this import at the top of the component file:

```javascript
import dynamic from "next/dynamic";
const DynamicRemirror = dynamic(
  () => import("@remirror/react").then((mod) => mod.Remirror),
  { ssr: false }
);
```

then, instead of using `<Remirror>` tag, I used `<DynamicRemirror>` everywhere in that component.

and the error was gone! Voila!

## Solution 2 - Detect Server Side Rendering

For those who cannot use the solution above, there is a NPM package called `React Aria` .

```javascript
npm i react-aria
```

It has a React hook called `useIsSSR`

```javascript
import { useIsSSR } from "@react-aria/ssr";
```

and then, in your component before returning any JSX or TSX, put this code:

```javascript
const isServer = useIsSSR();
if (isServer) {
    console.log("isServer", isServer);
    return null;
}
```

This will make sure that when Nextjs is rendering your component on the server, it doesn't initialize Remirror components, therefore there won't be any HTTP 500 errors.

There you go!

Thanks for reading.
