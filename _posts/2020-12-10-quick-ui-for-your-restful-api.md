---
title: "How to Build a Quick UI for Your Restful API + Howto Cheatsheet"
date: "2020-12-10"
tags: 
  - "net-core"
  - "api"
  - "csharp"
  - "dotnet-core"
header:
    overlay_image: "/img/posts/pexels-thisisengineering-3861943.jpg"
---

> Apis are technically built for other softwares to interact with. But in reality, humans (developers) interact with it a lot too. It's quite important for an Api to ease the interaction for both softwares and humans. But how?

There are times when humans need to deal with an Api, see it in action, visualise it and present it to end consumers. When an Api is being built, developers constantly need to work with it, run it, test it and be able to present it to other developers or in meetings. Once the api is released, it is other developers who would be working with that Api. They need to understand how api works, be able to build a client for that in their own technology stack and programming language to eventually integrate it into their software. You see ..? it's not only a machine needs to understand an Api anymore.

Furthermore, there are times when you want to build a feature that is rarely used, Or used only in certain situations. For example it's common to build an Api for initial data setup or to upload a file in case of manual data import. For features like that, it usually doesn't make sense to build a full fledged web UI with all the bells and whistles and incur cost for the company.

An api can be built in different ways. It can have different architectures such as [REST](https://en.wikipedia.org/wiki/Representational_state_transfer), [GraphQL](https://graphql.org/), [Falcor](https://netflix.github.io/falcor/), [gRPC](https://grpc.io/) and etc. It can have various security mechanisms such as Basic authentication (username and password), Api-key, Bearer Token (OAuth2) and etc. Each has its own usage for different solutions. In this article, I'm focusing on REST Apis as it is widely accepted and used.

## Entering OpenApi...

> The OpenAPI Specification (OAS) defines a standard, programming language-agnostic interface description for HTTP APIs, which allows both humans and computers to discover and understand the capabilities of a service without requiring access to source code, additional documentation, or inspection of network traffic.
> 
> [OpenAPI Github](https://github.com/OAI/OpenAPI-Specification)

OpenApi (a.k.a Swagger) is a file that describes the capabilities of an Api in JSON or YAML format. It describes the path of available capabilities of that Api as well as what parameters they take in and what would be the response in case of success or error. It even includes what security mechanism the api is protected with. If you want to see some examples, [take a look here](https://github.com/OAI/OpenAPI-Specification/tree/master/examples/v3.0).

There are tools that can generate this file automatically from your source code. Therefore you don't need to update it every time you make a change. There are also tools that can generate code for an Api client based on this file. It's a widely accepted specification especially for microservices architecture.

As you can imagine this file contains a lot of information and can be quite verbose and extensive. Although JSON and YML documents are supposed to be easy for humans to read but when they get long and big, It is almost impossible to read and understand. In the past couple of years, I have seen enterprise scale Apis with pretty long OpenApi (swagger) specification file.

## Entering SwaggerUI...

The good news is, OpenApi specification file can be easily read by softwares. So it must be quite easy for a tool to read a swagger file and build a web UI based on it. That is what [SwaggerUI](https://swagger.io/tools/swagger-ui/) does.

SwaggerUI is a human friendly web interface that is automatically generated. It can be hosted locally, on your web server or even on SwaggerHub.

It starts by showing a brief description about the Api, its license and contact information. Then it shows the HTTP scheme (http or https) and what the authorize mechanism is. For each capability, it shows action verbs in different distinguishable colours. Clicking on each, reveals what the input is, what the response is in case of success and what errors can be returned. There might be some examples as well. Finally there is a "_Try it out_" button, which allows you to actually run that Api and see the response back. If Api is configured to accept a file as input, SwaggerUI is capable of showing you an upload file window.

![This is how SwaggerUI looks like](https://programmerbyday.files.wordpress.com/2020/12/profile-20201209t114924.gif?w=500)

You can see a live example [here](https://petstore.swagger.io/) and try it yourself.

## How to add SwaggerUI to your dotnet core Api

SwaggerUI needs OpenApi specification file, therefore first, we need to generate that.

### Add Swashbuckle.AspNetCore

```
dotnet add package Swashbuckle.AspNetCore
```

### Enable XML comments so that it can be used in SwaggerUI

In _project .csproj_ file add these two lines:

```
<PropertyGroup>
   <GenerateDocumentationFile>true</GenerateDocumentationFile>
   <NoWarn>$(NoWarn);1591</NoWarn>
</PropertyGroup>
```

In _ConfigureServices_ method in _Startup.cs_ file add:

    services.AddSwaggerGen(options =>
    {
       // Use these lines to describe the authorize mechanism of the api
        options.AddSecurityDefinition(...);
        options.AddSecurityRequirement(...);

        // Set the comments path for the Swagger JSON and UI.
        var xmlFile = $"{Assembly.GetExecutingAssembly().GetName().Name}.xml";
        var xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFile);
        options.IncludeXmlComments(xmlPath);
    });

Note: Swagger needs http verbs to be explicitly defined on controller actions.

This will generate the OpenApi swagger file.

### Add SwaggerUI

Add these in _Configure_ method

    app.UseSwagger();
    app.UseSwaggerUI(options =>
                     options.SwaggerEndpoint("/swagger/v1/swagger.json", Assembly.GetExecutingAssembly().GetName().Name));

That's it!

Run your api project and go to `/swagger` path (like _https://localhost:5001/swagger_). 
Voilà !

## Check these for more:

- [Get started with Swashbuckle and ASP.NET Core](https://docs.microsoft.com/en-us/aspnet/core/tutorials/getting-started-with-swashbuckle?view=aspnetcore-5.0&tabs=visual-studio)
- [OpenApi Specification](https://swagger.io/resources/open-api/)
- [SwaggerUI](https://swagger.io/tools/swagger-ui/)
