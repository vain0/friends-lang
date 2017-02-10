﻿namespace VainZero.Friends.Core

type Predicate =
  | Predicate
    of string
with
  member this.Name =
    let (Predicate name) = this
    name

type Atom =
  | Atom
    of string
with
  member this.Name =
    let (Atom name) = this
    name

type Variable =
  {
    Name:
      string
    Id:
      int
  }
with
  static member Create(name) =
    {
      Name =
        name
      Id =
        -1
    }

  member this.ReplaceId(id) =
    { this with Id = id }

type Term =
  | VarTerm
    of Variable
  | AtomTerm
    of Atom
  | AppTerm
    of Atom * Term
  | ConsTerm
    of Term * Term

type AtomicProposition =
  {
    Predicate:
      Predicate
    Term:
      Term
  }
with
  static member Create(predicate, term) =
    {
      Predicate =
        predicate
      Term =
        term
    }

type Proposition =
  | AtomicProposition
    of AtomicProposition

type Rule =
  | AxiomRule
    of AtomicProposition
  | InferRule
    of AtomicProposition * Proposition
with
  member this.Head =
    match this with
    | AxiomRule prop ->
      prop
    | InferRule (prop, _) ->
      prop

  member this.Predicate =
    this.Head.Predicate

type Statement =
  | Rule
    of Rule
  | Query
    of Proposition

type Predicate with
  member this.Item
    with get term =
      AtomicProposition.Create(this, term)
