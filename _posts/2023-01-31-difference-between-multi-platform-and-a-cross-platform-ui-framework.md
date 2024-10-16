---
title: "The Difference Between a multi-platform and a cross-platform UI framework"
date: "2023-01-31"
tags: 
  - "clean-code"
  - "javascript-framework"
header:
    overlay_image: "/img/posts/pexels-picjumbocom-196644.jpg"
---

> We want to give our users a native experience on their platform of choice. A native experience is when an app looks the same and has the same features as other native apps. A common way to achieve this is by using frameworks. However, each framework takes a slightly different approach.

It's very rare these days to build an app that runs only on a single platform. Every app is trying hard to reach more users and users are more tech-diverse than ever before. Each user expects to be able to run your application on platform they feel most comfortable with. It can be a Windows machine, a mac, a Linux distro (like Ubuntu), any TV operating system (such as Tizen), as a hosted website, or even a mobile phone app like iOS or android.

As you can see, it is a common expectation for an app to be available on different platforms. Most of the programming languages codes (like C#, java, javascript and typescript) can be run on these platforms, however the biggest challenge is UI. We want to give users a native experience on their platform. A common way to achieve this is by using UI frameworks. These frameworks which are mostly written in Javascript (and called javascript frameworks) help us to create native experience for our users and give them the ability to use all the features that come from their platform of choice.

There are two different category of these frameworks:

1. Multi-platform frameworks

3. Cross-platform frameworks

## What is a multi-platform UI framework?

A multi-platform UI framework is when you create one solution that contains different projects for each running platform. This approach tries to share some of the code between these platforms.

Some of the benefits of a multi-platform framework is:

- The separation gives you more flexibility to config and access native OS-level settings and services

Some drawbacks are:

- Everytime you want to add a 3rd party package, you have to copy-paste changes into ios, android and other platform configs. And most of the times, it messes with other packages and creates some issues that you might not know exactly how to resolve.

- Longer learning curve

To the best of my knowledge some of the well-known multi-platform UI frameworks are: [Xamarin.Forms](https://dotnet.microsoft.com/en-us/apps/xamarin/xamarin-forms), [ReactNative](https://reactnative.dev/), [MAUI](https://learn.microsoft.com/en-us/dotnet/maui/what-is-maui?view=net-maui-7.0)

## What is a cross-platform UI framework?

A Cross-platform UI framework is when you have one solution that contains only one project. That project can be compiled and run on different platforms. This means you only have one project, and there is usually an extra hidden layer that translates this to the executing platform. A cross-platform framework is when you don't need to know about the platform(s) it's going to run on, you don't have different configurations for different platforms.

Some of the benefits of a cross-platform framework is:

- Maximum code sharing

- Quicker learning curve and faster early development

- Cleaner and more succinct code and configurations

Some drawbacks are:

- Less flexibility to access OS-level settings and services

- You are limited to use only the components and libraries that match with the framework. Basically, you can't use any 3rd party available component out there. It can become restrictive if the cross-platform framework is not mature enough.

- Cross-platform frameworks usually use a render library, that might not give you a very beautiful and performant render in some cases

To the best of my knowledge some of the well-known multi-platform UI frameworks are: [Avalonia](https://avaloniaui.net/), [Electron](https://www.electronjs.org/), [Flutter](https://flutter.dev/), [React Expo](https://expo.dev/), [Next.js](https://nextjs.org/)

## Which one is better?

It's a million dollar question and similar to any other 'best' question in tech, _It Depends_.

I'd first ask myself how much flexibility I need to build that app (how much is absolutely required from day one). But as a general rule, I tend to always start with cross-platform and change to multi-platform if only I need it badly and there is no other clean, readable and maintainable way to achieve it with that cross-platform framework. After all, I explained before [why it's so crucial to prioritise code readability](https://armannotes.com/2022/06/07/why-you-should-prioritise-code-readability-even-higher-than-performance/) and [how you should write code for new developers](https://armannotes.com/2020/11/13/why-a-newly-joined-developer-affects-how-you-write-code/).

What do you think? write me in the comments below.
