---
title: "What is GraphQL? How to Use it in ASP.NET Core WebApi? Let Me Explain Simply..."
date: "2021-05-04"
tags: 
  - "net-core"
  - "api"
  - "asp-net"
  - "dotnet-core"
  - "graphql"
  - "rest-api"
  - "web-api"
header:
    overlay_image: "/img/posts/pexels-pixabay-373543.jpg"
---

From ASP.NET Web Forms to ASP.NET AJAX, then ASP.NET MVC and ASP.NET Web API, building an API has evolved massively. An API started from being a function you can run on another computer, evolved massively to accommodate what today's applications need.

Throughout the projects I have been involved in, I have always worked with REST APIs. REST API architecture is simple and clean, it's easy to pick up for new developers and it is less mistake-prone since each and every API is going to have the same structure.

In a typical REST API, you would have a separate endpoint for each object type. That endpoint, based on your implementation, would provide GET, POST, PUT, PATCH, DELETE actions. In addition to that, they could get some query parameters, to filter the data (for example based on an ID or date, etc.). But when you would get the result, you would get the whole object. And that can be a bigger headache when you are using Domain-Driven Design architecture and dealing with millions/billions of aggregate objects.

## Entering GraphQL...

> GraphQL is a query language for APIs. GraphQL gives clients the power to ask for exactly what they need and nothing more, makes it easier to evolve APIs over time, and enables powerful developer tools.
> 
> [graphql.org](https://graphql.org/)

In 2012, Facebook built GraphQL to address the above issue. GraphQL, typically has one endpoint. And, that endpoint accepts a query. So far, it is not that fascinating, but the actual beauty is in the "query" I just mentioned. In the query, you mention what type (or types) you want, what property values you'd want to use as filter, and lastly, what properties of those types you'd like to get back.

## How does GraphQL work?

As you guessed, you can request for one or more types, you can search/filter based on any property and you can get only the properties you are interested in. The query is in JSON format and you'd get the result back in JSON format. This can save you multiple roundtrips to the server and decrease your server load as well as network traffic and latency.

I know you are excited to see an example of a query .. so let me show you:

#### Query

query PersonAndFriends {
   person (id: 2001) {
      name
      friends {
         name
      }
   }
}

#### Result

{
   "data": {
   "person": {
       "name": "Rose DeWitt",
       "friends": \[
       {
          "name": "Jack Dawson"
       },
       {
          "name": "Cal Hockley"
       },
       {
          "name": "Ruth DeWitt"
       }
     \]
    }
  }
}

Above, I defined a query with the name "PersonAndFriends", I'm asking for a _person_ with ID=2001, and I am interested to get back its _name_ and _friends_ fields. Within _friends_ (which can be an array), I'm asking to only get back _name_ field. On top of that, the shape of a GraphQL query closely matches the result of it. It's cool, isn't it?

There are 3 types of query. "_query_" itself, "_mutation_" and "_subscription_". _query_ is your way to request for data, _mutate_ is the way to change the data (such as create a new record, update it, delete it).

Queries accept variables, so that you don't need to manipulate string to put your arguments dynamically.

#### Query with variables

query PersonQuery($id: ID!) {
  person(id: $id) {
    name
  }
}

{
  "id": 2001
}

#### Result

{
  "data": {
    "person": {
      "name": "Rose DeWitt",
    }
  }
}

Internally, The query and each field of types is backed by a separate function called _resolver_ which is provided by the developer to GraphQL. Execution of a query starts by calling the resolver function of the query with passed-in arguments. If the function returns an object, GraphQL will execute its resolver passing in the object. For each selected field, GraphQL calls their resolver functions to get their values. This process continues until all resolvers return Scalar types and not objects. It is as if GraphQL traverses a graph from its root until it covers all the leaves, hence the name _**Graph** Query Language_.

## How to use GraphQL?

In order to use GraphQL, two things should be provided to build a GraphQL server. Firstly, object types, what data can be queried, and how it can be queried. Defining types and schemas, help GraphQL to validate queries and execute them. Secondly, resolver functions for each type and its fields.

### Defining types

type Query {
  actor(episode: Episode): Cast
  car(id: ID!): Vehicle
}

type Cast {
  id: ID!
  name: String!
  episode: \[Episode!\]!
  height(unit: LengthUnit = METER): Float
}

enum Episode {
  PILOT
  ONE
  FINALE
}

"!" comes after the field type and shows that field is non-nullable and when you query that field, it will always have a value. \[ and \] represent an array. Fields can have arguments, and arguments can have default values(e.g. _height_ field). Built-In scalar types can be **Int** (32-bit integer), **Float**, **String**, **Boolean** and **ID** (which is non-human-readable and unique string).

The query structure is actually another type named "Query". It defines, what fields can be queried, and what arguments each field can take. Also, it defined what fields and arguments are _non-nullable_. Mutation is also defined in the same way.

GraphQL allows you to define _input object types_ which are objects that you can pass as an argument to a query or mutation. Input types need to be defined separately with _input_ keyword. Input types can have relationship with other input types but cannot refer object types or have arguments.

input FoodReviewInput {
  stars: Int!
  comment: String
}

### Defining resolver functions

It's quite straight-forward, you start with a function to resolve the query:

Query: {
  actor(obj, args, context, info) {
    return context.db.getActorByID(args.id).then(
      response => new Actor(response)
    )
  }
}

Each function has four arguments, _obj_ is the object resulted from running the previous function, _args_ is field or query arguments, _context_ is a contextual object containing information like the logged-in user and etcetera, _info_ contains information about the query and its types.

Just like that, you define the rest of the functions for types and fields:

Actor: {
  name(obj, args, context, info) {
    return obj.name
  }
Vehicle(obj, args, context, info) {
    return obj.vehicleIDs.map(
      id => context.db.getVehicleByID(id).then(
        response => new Vehicle(response)
      )
    )
  } 
}

## But That seems to be a lot of work!

Yes, but the good news is, there are many libraries available that would take the complexity away from you. They take care of object definition, authorization, security, pagination, caching, etc. GraphQL website provides you with a list of libraries and tools you can use in your preferred programming language [here](https://graphql.org/code/).

## How to use GraphQL in .NET Core?

I found [hotchocolate library](https://github.com/ChilliCream/hotchocolate) which does most of the work and creates a neat GraphQL server in no time. I found its tutorial quite succinct and to-the-point, you can find it [here](https://chillicream.com/docs/hotchocolate/get-started/)

## Architect discussion: When to use GraphQL?

![](https://programmerbyday.files.wordpress.com/2021/04/architect.png?w=300)

Like any other technology, GraphQL has its own pros and cons. When you want to make an architectural decision, you need to be aware of these pros and cons and make sure that this technology can do what you want to achieve. I found these points about GraphQL versus REST Api:

### What you get:

- **Ask for what you need:** As you know by now, in GraphQL you mention the fields you want to be returned to you, and that is one of the main benefits of using GraphQL. Especially if you are dealing with large aggregate objects and you need to transfer data over public internet (which incurs cost), This is very beneficial. Although REST API doesn't have this feature by itself, it is technically possible to use [OData](https://www.odata.org/) to query REST API. However, in my opinion, GraphQL is more like a standard for this and it's better to rely on a standard than a combination of technologies.
- **Solves n+1 problem:** Imagine a situation where you get a root object (like a Person) and then loop through its Friends collection and send another request to fetch each Friend object separately. GraphQL solves this problem, since you can mention whatever you want in your query.
- **Combined Query:** Combined queries are when you request for separate not-related objects in the same query. For example, you can write a query that returns persons and books. Normally you would have to make two separate API calls, but with GraphQL you can do it in one query.
- **API Versioning:** GraphQL query and its result is in JSON format. Therefore, if there is any changes in the schema, JSON inherently handles that for you. And every subsequent systems that use your GraphQL endpoint, since they use JSON, it's safe for them as well. Obviously, if you delete/rename a field, that's still a breaking change.

### What to watch out:

- **Caching:** REST API is heavily based on how HTTP works, and HTTP has a nice caching mechanism. However, GraphQL needs a bit of more work to implement its own caching.
- **Harder with [Microservice Architecture](https://microservices.io/patterns/microservices.html):** When you have separate micro-services for different aggregates, in REST API, you can call separate URLs and get both objects. But in GraphQL, since you only deal with one endpoint, GraphQL needs to call those endpoints separately behind-the-scene, aggregate the data and send it back to you. Which can be not-ideal in some solutions.
- **Combined Query:** Combined query is one of the great features, however, if you are not careful, it can expose some data to the users that should not have access to that part of the data.
- **Monitoring:** Since REST API is based on HTTP protocol, there are many layers of monitoring already built around that. You can monitor and log your REST API calls inside and out. However, the monitoring tools for GraphQL is still thin and you need to consider what's available if monitoring and logging is a requirement for your solution.

## How to learn more...

- https://graphql.org/learn
- https://graphql.org/code
- https://chillicream.com/docs/hotchocolate/get-started/

Voilà! Thanks for reading.
