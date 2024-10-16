---
title: Why You Should Always Use Span for React.js Texts
tags:
  - react
  - reactjs
  - nextjs
published: true
date: '2023-12-18'
---
So I learned this the hard way...

There is a translation service in almost every browser these days, which translates all the texts on a website to user-preferred language.

Browsers (like Chrome) would replace a text with a `<font>` markup tag like this:

```javascript
// original
<div>Some Text</div>

// Translated
<div>
  <font style="vertical-align: inherit;">
    <font style="vertical-align: inherit;">ä¸äºæå­</font>
  </font>
</div>

```

And, this will ruin your DOM and therefore React.js would stop working. Mostly, if you have a condition before your text like this:

```javascript
// this will throw error after browser auto-translate
{this.state.checked && "Some Text"}

```

Most probably your user are going to get an error like below when their browser does the auto-translation, and believe me it's really hard to know about this happening to your users or even to debug it.

> Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.

The node referenced by React is replaced completely with a `<font>` node, therefore reactjs cannot find that node anymore. hence the error above.

## Solution 1: Disabling the auto-translate (not recommended)

You can disable this feature for all of your users across the world with the following meta tag:

```javascript
<meta name="google" content="notranslate">

```

However, as you have already guessed, this is not good user experience and I wouldn't recommend doing this.

## Solution 2: Wrap texts with

This is what I have decided to do for my [mood recommendation ai](https://www.taranify.com) web app. It's easy and effective. All you need to do is to avoid using bare texts and Always Always Always put your texts in between `<span></span>` .

This way, when Chrome or other browsers replace the text with nodes, the node around it stays the same and therefore react would not lose its reference to the node.

```javascript
// Correct way of using texts in Reactjs and Nextjs
{condition && <span>Welcome</span>}

```

![https://raw.githubusercontent.com/armannaj/armannaj.github.io/master/img/F13xWbcAAcbv.png](https://raw.githubusercontent.com/armannaj/armannaj.github.io/master/img/F13xWbcAAcbv.png)

You can read more about it on [this React Github issue](https://github.com/facebook/react/issues/11538#issuecomment-390386520).

Voila! now you are going to have happy users from all over the world.
