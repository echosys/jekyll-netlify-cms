---
title: "How to Run a DotNET App on Every Platform similar to NPM"
date: "2022-11-28"
tags: 
  - "net-6"
  - "net-7"
  - "net-core"
  - "dotnet-core"
  - "npm"
header:
    overlay_image: "/img/posts/pexels-realtoughcandycom-11035380.jpg"
---

> Instead of publishing your dotnet application for each platform separately, there is a way to publish your app once as platform agnostic and run it on every platform easily.

We all know, dotnet applications can be run on any platform. Be it a windows machine, macOS (both x64 and arm64 architectures) and linux, dotnet can run our application. Although I will explain how to publish an executable of your application for any platform, there is a way to publish your app platform agnostic. A platform agnostic is when you publish your application once and you can run it on every platform. This is similar to the same approach _npm_ has been doing since the beginning.

## How to publish a dotnet application for different platforms?

dotnet cli has a nice parameter for that:

```bash
dotnet publish -r <runtime-ID>
```

_runtime-ID_ tells dotnet which platform this application is going to run on. Common IDs are win-x64 , osx-x64 , osx-arm64 and linux-x64. To see the full list of all runtime IDs you can publish to, [check here](https://learn.microsoft.com/en-us/dotnet/core/rid-catalog#using-rids).

A few examples I usually use, are:

```bash
dotnet publish -r win-x64 -p:Configuration=Release -p:DebugType=None -p:DebugSymbols=false -p:Version=1.0.1
```

```bash
dotnet publish -r osx-x64 -p:Configuration=Release -p:DebugType=None -p:DebugSymbols=false -p:Version=1.1.25
```

## How to publish platform-agnostic?

That's a good question. There is a simple way to do that, but there is an issue with that. So, you can publish the app in platform agnostic way, by not mentioning _**\-r**_ option in _**dotnet publish**_. Here is an example:

```bash
dotnet publish -p:Configuration=Release -p:DebugType=None -p:DebugSymbols=false -p:Version=1.0.1
```

When you don't mention a specific runtime platform, _dotnet publish_ generates an executable for the current platform you are on as well as the dll file for the app. Even if it is a console application, it still generates a dll for it. The executable file is platform-dependant but the dll file is not. But as you know, you cannot run a dll file directly by clicking on it. So how do end users get to run the application by using its dll file? here is how:

```bash
dotnet <dll filename>
```

For example:

```bash
dotnet ConsoleApp1.dll
```

This is a very similar pattern to how npm applications and packages are run via _npm run <package or filename>_

## How and What to Release to end users?

What I like to do is that I publish my app in runtime-agnostic way, then I remove any executable it might have generated and keep only dll files. Then I can easily zip this folder and ship it to end users or other developers. I tend to put a small _README.md_ file to explain how they should run it.

## What would make it better?

As you've seen, when we publish our .NET application in a runtime agnostic manner, it generates a dll file. In order to run it we have to give the whole filename and its extensions to the dotnet CLI. This is a little bit bothersome, as a .dll file is not usually an executable file and this can confuse users or developers. I wish there was a way to remove this extension completely and just use the filename.

I haven't been able to find any solution for that, if you know, please share it with us in the comment section.
