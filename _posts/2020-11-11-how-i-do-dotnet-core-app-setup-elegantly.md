---
title: "How I Do dotnet core App Setup Elegantly"
date: "2020-11-11"
tags: 
  - "net-core"
  - "c"
  - "clean-code"
  - "csharp"
  - "dotnet-core"
---

> Program.cs is usually one of the files that get quite messy after a while in every .NET project. From then, developers will add code on top of all that mess or even worse create a new class and reference that in.
> 
> Here's a structure I found over years that helps me to keep app startup code readable and clean.

Generally there are 3 things to setup in _Main_ function:

1. Ingress appsettings and options (via appsettings files, environment variables or command line)
2. Setup logging
3. Setup ServiceProvider (dotnet core dependency injection)

I add _Microsoft.Extensions.Hosting_ nuget package and use this in Main:

var hostBuilder = Host.CreateDefaultBuilder()
                   .ConfigureAppConfiguration(AddSettings)
                   .ConfigureServices(AddOptions)
                   .ConfigureServices(AddServices);
await builder.RunConsoleAsync();

_CreateDefaultBuilder()_ creates and sets up all the 3 things above and return an _IHostBuilder_ instance. _IHostBuilder_ has couple of nice methods that accept lambda functions:

- **ConfigureAppConfiguration:** to add configurations related to the app
- **ConfigureHostConfiguration:** to add configurations related to the host itself (such as Kestrel, etc.)
- **ConfigureServices:** add classes to DI

I leverage those and divide my app startup code in these three nice methods:

private static void AddSettings(IConfigurationBuilder configurationBuilder)
        {
            configurationBuilder
                .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
                .AddEnvironmentVariables();
        }

private static void AddServices(HostBuilderContext context, IServiceCollection serviceCollection)
        {
            serviceCollection
		.AddTransient<,>()
                .AddSingleton<>();
            
            serviceCollection.AddHostedService<>();
        }

private static void AddOptions(HostBuilderContext context, IServiceCollection serviceProvider)
        {
            var configuration = context.Configuration;
            
            serviceProvider.AddOptions<MyOptions>()
                .Bind(configuration.GetSection(nameof(MyOptions)))
                .ValidateDataAnnotations();
        }

## So what benefits do I get?

- Main method is clean and simple and shows the setup steps in high-level view
- It uses Options pattern to have configurations as objects. This provides all compile time checks and intelisense features.
- The amount of usage of stings is minimum. Therefore classes can be moved/renamed without worrying about app setup code.

What do you think?
